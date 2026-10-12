import "server-only";
import { listRows, tables } from "./baserow";
import { F } from "./fields";
import { todayNL } from "./dates";
import type { Catalog, Item } from "./types";

export const maxDays = () => Number(process.env.MAX_DAYS ?? 14);

const TTL = 30_000;
let cache: { at: number; data: Catalog } | null = null;
export const invalidateCatalog = () => { cache = null; };

/** Open + partially returned loans: id -> due date. */
export async function openLoanDueDates(): Promise<Map<number, string>> {
  const [open, partial] = await Promise.all([
    listRows(tables.loans(), { [`filter__${F.loan.status}__contains`]: "Open" }),
    listRows(tables.loans(), { [`filter__${F.loan.status}__contains`]: "Deels" }),
  ]);
  return new Map([...open, ...partial].map((r) => [r.id, String(r[F.loan.due])]));
}

/** Units still out, and earliest return date, per material id. */
async function outstanding() {
  const [due, lines] = await Promise.all([
    openLoanDueDates(),
    listRows(tables.lines(), { [`filter__${F.line.open}__higher_than`]: "0" }),
  ]);
  const out = new Map<number, { qty: number; back: string }>();
  for (const l of lines) {
    const due_ = due.get(l[F.line.loan]?.[0]?.id);
    const matId = l[F.line.mat]?.[0]?.id;
    if (!due_ || !matId) continue;
    const qty = Number(l[F.line.qty]) - Number(l[F.line.back] || 0);
    if (qty <= 0) continue;
    const cur = out.get(matId);
    out.set(matId, { qty: (cur?.qty ?? 0) + qty, back: cur && cur.back < due_ ? cur.back : due_ });
  }
  return out;
}

export async function getCatalog(fresh = false): Promise<Catalog> {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.data;
  const [cats, mats, out] = await Promise.all([
    listRows(tables.categories()),
    listRows(tables.materials(), { [`filter__${F.mat.active}__boolean`]: "true" }),
    outstanding(),
  ]);
  const categories = cats
    .map((c) => ({ id: c.id, name: String(c[F.cat.name]), order: Number(c[F.cat.order] ?? 0) }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map(({ id, name }) => ({ id, name }));
  const items: Item[] = mats
    .map((m) => {
      const stock = Number(m[F.mat.stock] ?? 0);
      const o = out.get(m.id);
      const photo = m[F.mat.photo]?.[0];
      return {
        id: m.id,
        name: String(m[F.mat.name]),
        categoryId: m[F.mat.cat]?.[0]?.id ?? 0,
        stock,
        available: Math.max(0, stock - (o?.qty ?? 0)),
        back: o?.back ?? null,
        thumb: photo?.thumbnails?.small?.url ?? photo?.url ?? null,
        large: photo?.url ?? null,
      };
    })
    .filter((i) => categories.some((c) => c.id === i.categoryId))
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  const data = { categories, items, today: todayNL(), maxDays: maxDays() };
  cache = { at: Date.now(), data };
  return data;
}
