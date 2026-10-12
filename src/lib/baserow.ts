import "server-only";

type Row = Record<string, any> & { id: number };

const base = () => (process.env.BASEROW_URL ?? "").replace(/\/$/, "");

export const tables = {
  categories: () => need("BASEROW_TABLE_CATEGORIEEN"),
  materials: () => need("BASEROW_TABLE_MATERIAAL"),
  loans: () => need("BASEROW_TABLE_LENINGEN"),
  lines: () => need("BASEROW_TABLE_LEENREGELS"),
};

function need(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var ${key}`);
  return v;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(base() + path, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Token ${need("BASEROW_TOKEN")}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Baserow ${init.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const rowsPath = (t: string) => `/api/database/rows/table/${t}/`;

/** All rows of a table (follows pagination). `filters` are user_field_names filters, e.g. {"filter__Actief__boolean":"true"}. */
export async function listRows(table: string, filters: Record<string, string> = {}): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 1; ; page++) {
    const qs = new URLSearchParams({ user_field_names: "true", size: "200", page: String(page), ...filters });
    const data = await call<{ results: Row[]; next: string | null }>(`${rowsPath(table)}?${qs}`);
    out.push(...data.results);
    if (!data.next) return out;
  }
}

export function createRow(table: string, fields: Record<string, unknown>): Promise<Row> {
  return call(`${rowsPath(table)}?user_field_names=true`, { method: "POST", body: JSON.stringify(fields) });
}

export async function createRows(table: string, items: Record<string, unknown>[]): Promise<Row[]> {
  const data = await call<{ items: Row[] }>(`${rowsPath(table)}batch/?user_field_names=true`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
  return data.items;
}

export async function updateRows(table: string, items: ({ id: number } & Record<string, unknown>)[]): Promise<void> {
  if (!items.length) return;
  await call(`${rowsPath(table)}batch/?user_field_names=true`, { method: "PATCH", body: JSON.stringify({ items }) });
}

export async function deleteRows(table: string, ids: number[]): Promise<void> {
  if (!ids.length) return;
  await call(`${rowsPath(table)}batch-delete/`, { method: "POST", body: JSON.stringify({ items: ids }) });
}
