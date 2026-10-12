import "server-only";
import { createRow, createRows, deleteRows, listRows, tables, updateRows } from "./baserow";
import { getCatalog, invalidateCatalog, openLoanDueDates } from "./catalog";
import { addDays, isWeekend, todayNL } from "./dates";
import { F } from "./fields";
import type { Loan, LoanLine, LoanStatus } from "./types";

export class LoanError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export type NewLoan = { name: string; email: string; due: string; items: { id: number; qty: number }[] };

export async function createLoan(input: NewLoan): Promise<Loan> {
  const name = input.name?.trim();
  const email = input.email?.trim();
  if (!name || name.length > 100) throw new LoanError("Vul je naam in.");
  if (!EMAIL_RE.test(email ?? "") || email.length > 200) throw new LoanError("Vul een geldig e-mailadres in.");
  const today = todayNL();
  const { maxDays } = await getCatalog();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.due ?? "") || input.due < today || input.due > addDays(today, maxDays) || isWeekend(input.due))
    throw new LoanError("Kies een geldige dag om terug te brengen.");
  const wanted = new Map<number, number>();
  for (const i of input.items ?? []) {
    if (!Number.isInteger(i.qty) || i.qty < 1) throw new LoanError("Ongeldig aantal.");
    wanted.set(i.id, (wanted.get(i.id) ?? 0) + i.qty);
  }
  if (!wanted.size) throw new LoanError("Je mandje is leeg.");

  // Re-check availability against fresh data (no cache).
  const catalog = await getCatalog(true);
  for (const [id, qty] of wanted) {
    const item = catalog.items.find((i) => i.id === id);
    if (!item) throw new LoanError("Een item uit je mandje bestaat niet meer.", 409);
    if (qty > item.available)
      throw new LoanError(
        item.available === 0 ? `${item.name} is net uitgeleend.` : `Van ${item.name} zijn nog maar ${item.available} beschikbaar.`,
        409,
      );
  }

  const loan = await createRow(tables.loans(), {
    [F.loan.name]: name,
    [F.loan.email]: email,
    [F.loan.due]: input.due,
    [F.loan.status]: "Open",
  });
  try {
    await createRows(
      tables.lines(),
      [...wanted].map(([mat, qty]) => ({ [F.line.title]: `Lening van ${name}`, [F.line.loan]: [loan.id], [F.line.mat]: [mat], [F.line.qty]: qty, [F.line.back]: 0 })),
    );
  } catch (e) {
    await deleteRows(tables.loans(), [loan.id]).catch(() => {});
    throw e;
  }
  invalidateCatalog();
  const lines = [...wanted].map(([mat, qty], i) => ({
    id: i, materialId: mat, name: catalog.items.find((x) => x.id === mat)!.name, qty, returned: 0,
  }));
  return { id: loan.id, number: String(loan[F.loan.number] ?? ""), name, email, due: input.due, status: "Open", lastReminder: null, lines };
}

const toLoan = (r: Record<string, any>, lines: LoanLine[]): Loan => ({
  id: r.id,
  number: String(r[F.loan.number] ?? r.id),
  name: String(r[F.loan.name] ?? ""),
  email: String(r[F.loan.email] ?? ""),
  due: String(r[F.loan.due] ?? ""),
  status: (r[F.loan.status]?.value ?? r[F.loan.status] ?? "Open") as LoanStatus,
  lastReminder: r[F.loan.lastReminder] || null,
  lines,
});

async function materialNames(): Promise<Map<number, string>> {
  const mats = await listRows(tables.materials());
  return new Map(mats.map((m) => [m.id, String(m[F.mat.name])]));
}

const toLine = (l: Record<string, any>, names: Map<number, string>): LoanLine => ({
  id: l.id,
  materialId: l[F.line.mat]?.[0]?.id,
  name: names.get(l[F.line.mat]?.[0]?.id) ?? String(l[F.line.mat]?.[0]?.value ?? "?"),
  qty: Number(l[F.line.qty]),
  returned: Number(l[F.line.back] || 0),
});

export type OverdueLoan = Loan & { daysLate: number };

/** Open/partial loans (oldest due date first), with only the not-yet-returned lines. */
export async function activeLoans(): Promise<Loan[]> {
  const [loanRows, lineRows, names] = await Promise.all([
    Promise.all(
      ["Open", "Deels"].map((s) => listRows(tables.loans(), { [`filter__${F.loan.status}__contains`]: s })),
    ).then((r) => r.flat()),
    listRows(tables.lines(), { [`filter__${F.line.open}__higher_than`]: "0" }),
    materialNames(),
  ]);
  return loanRows
    .map((r) =>
      toLoan(
        r,
        lineRows.filter((l) => l[F.line.loan]?.[0]?.id === r.id).map((l) => toLine(l, names)).filter((l) => l.qty > l.returned),
      ),
    )
    .filter((l) => l.lines.length)
    .sort((a, b) => a.due.localeCompare(b.due) || a.id - b.id);
}

/** Open/partial loans past their date, with only the not-yet-returned lines. */
export async function overdueLoans(today: string): Promise<Loan[]> {
  return (await activeLoans()).filter((l) => l.due < today);
}

/**
 * Register a (partial) return. `back` maps line id -> total units back so far (not a delta).
 * Status becomes "Terug" (or "Beschadigd" if `damaged`) once every line is complete, else "Deels terug".
 */
export async function returnLoan(loanId: number, back: Record<number, number>, damaged = false): Promise<LoanStatus> {
  const lines = await listRows(tables.lines(), { [`filter__${F.line.loan}__link_row_has`]: String(loanId) });
  if (!lines.length) throw new LoanError("Lening niet gevonden.", 404);

  const updates: { id: number; [k: string]: unknown }[] = [];
  let complete = true;
  for (const l of lines) {
    const qty = Number(l[F.line.qty]);
    const now = back[l.id] ?? Number(l[F.line.back] || 0);
    if (!Number.isInteger(now) || now < 0 || now > qty) throw new LoanError("Ongeldig aantal.");
    if (now !== Number(l[F.line.back] || 0)) updates.push({ id: l.id, [F.line.back]: now });
    if (now < qty) complete = false;
  }
  for (const id of Object.keys(back).map(Number))
    if (!lines.some((l) => l.id === id)) throw new LoanError("Regel hoort niet bij deze lening.");

  const status: LoanStatus = !complete ? "Deels terug" : damaged ? "Beschadigd" : "Terug";
  await updateRows(tables.lines(), updates);
  await updateRows(tables.loans(), [
    { id: loanId, [F.loan.status]: status, ...(complete ? { [F.loan.returnedOn]: todayNL() } : {}) },
  ]);
  invalidateCatalog();
  return status;
}

export const markReminded = (loanIds: number[], today: string) =>
  updateRows(tables.loans(), loanIds.map((id) => ({ id, [F.loan.lastReminder]: today })));
