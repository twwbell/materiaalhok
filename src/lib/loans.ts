import "server-only";
import { randomBytes } from "node:crypto";
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

  const token = randomBytes(18).toString("base64url");
  const loan = await createRow(tables.loans(), {
    [F.loan.name]: name,
    [F.loan.email]: email,
    [F.loan.due]: input.due,
    [F.loan.status]: "Open",
    [F.loan.token]: token,
  });
  try {
    await createRows(
      tables.lines(),
      [...wanted].map(([mat, qty]) => ({ [F.line.loan]: [loan.id], [F.line.mat]: [mat], [F.line.qty]: qty, [F.line.back]: 0 })),
    );
  } catch (e) {
    await deleteRows(tables.loans(), [loan.id]).catch(() => {});
    throw e;
  }
  invalidateCatalog();
  const lines = [...wanted].map(([mat, qty], i) => ({
    id: i, materialId: mat, name: catalog.items.find((x) => x.id === mat)!.name, qty, returned: 0,
  }));
  return { id: loan.id, number: String(loan[F.loan.number] ?? ""), name, email, due: input.due, status: "Open", token, lastReminder: null, lines };
}

const toLoan = (r: Record<string, any>, lines: LoanLine[]): Loan => ({
  id: r.id,
  number: String(r[F.loan.number] ?? r.id),
  name: String(r[F.loan.name] ?? ""),
  email: String(r[F.loan.email] ?? ""),
  due: String(r[F.loan.due] ?? ""),
  status: (r[F.loan.status]?.value ?? r[F.loan.status] ?? "Open") as LoanStatus,
  token: String(r[F.loan.token] ?? ""),
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

export async function getLoanByToken(token: string): Promise<Loan | null> {
  if (!/^[\w-]{10,64}$/.test(token)) return null;
  const rows = await listRows(tables.loans(), { [`filter__${F.loan.token}__equal`]: token });
  const row = rows[0];
  if (!row) return null;
  const [lines, names] = await Promise.all([
    listRows(tables.lines(), { [`filter__${F.line.loan}__link_row_has`]: String(row.id) }),
    materialNames(),
  ]);
  return toLoan(row, lines.map((l) => toLine(l, names)));
}

/** Set returned amounts per line id; status follows from the totals (or is forced, e.g. Beschadigd). */
export async function applyReturn(loan: Loan, returned: Map<number, number>, forceStatus?: LoanStatus): Promise<LoanStatus> {
  const next = loan.lines.map((l) => ({ ...l, returned: Math.max(0, Math.min(l.qty, returned.get(l.id) ?? l.returned)) }));
  const done = next.every((l) => l.returned >= l.qty);
  const status: LoanStatus = forceStatus ?? (done ? "Terug" : next.some((l) => l.returned > 0) ? "Deels terug" : "Open");
  await updateRows(tables.lines(), next.map((l) => ({ id: l.id, [F.line.back]: l.returned })));
  await updateRows(tables.loans(), [
    { id: loan.id, [F.loan.status]: status, [F.loan.returnedOn]: status === "Open" || status === "Deels terug" ? null : todayNL() },
  ]);
  invalidateCatalog();
  return status;
}

export type OverdueLoan = Loan & { daysLate: number };

/** Open/partial loans past their date, with only the not-yet-returned lines. */
export async function overdueLoans(today: string): Promise<Loan[]> {
  const due = await openLoanDueDates();
  const overdueIds = [...due].filter(([, d]) => d < today).map(([id]) => id);
  if (!overdueIds.length) return [];
  const [loanRows, lineRows, names] = await Promise.all([
    Promise.all(
      ["Open", "Deels"].map((s) => listRows(tables.loans(), { [`filter__${F.loan.status}__contains`]: s })),
    ).then((r) => r.flat()),
    listRows(tables.lines(), { [`filter__${F.line.open}__higher_than`]: "0" }),
    materialNames(),
  ]);
  return loanRows
    .filter((r) => overdueIds.includes(r.id))
    .map((r) =>
      toLoan(
        r,
        lineRows.filter((l) => l[F.line.loan]?.[0]?.id === r.id).map((l) => toLine(l, names)).filter((l) => l.qty > l.returned),
      ),
    )
    .filter((l) => l.lines.length);
}

export const markReminded = (loanIds: number[], today: string) =>
  updateRows(tables.loans(), loanIds.map((id) => ({ id, [F.loan.lastReminder]: today })));
