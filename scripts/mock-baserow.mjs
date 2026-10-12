// Minimal in-memory Baserow mock for local testing: node scripts/mock-baserow.mjs  (port 4010)
import http from "node:http";

const T = { cat: 1, mat: 2, loan: 3, line: 4 };
const db = { 1: [], 2: [], 3: [], 4: [] };
let next = { 1: 1, 2: 1, 3: 1, 4: 1 };
const add = (t, r) => { const row = { id: next[t]++, ...r }; db[t].push(row); return row; };

const CATS = ["Balsporten", "Turnen", "Atletiek"];
CATS.forEach((n, i) => add(1, { Naam: n, Volgorde: i + 1 }));
const ITEMS = [["Voetbal", 0, 20], ["Basketbal", 0, 12], ["Bok", 1, 1], ["Springplank", 1, 2], ["Startblokken", 2, 4]];
ITEMS.forEach(([n, c, s]) => add(2, { Naam: n, Categorie: [{ id: c + 1, value: CATS[c] }], Voorraad: String(s), Foto: [], Actief: true }));

const sel = (v) => ({ id: 1, value: v, color: "x" });
const expand = (t, row) => {
  const r = { ...row };
  if (t === 3) { r.Nummer = String(row.id); r.Status = sel(row.Status); r["Terugbrengen vóór"] = row["Terugbrengen vóór"] ?? null; }
  if (t === 4) {
    r.Lening = (row.Lening ?? []).map((id) => ({ id, value: String(id) }));
    r.Materiaal = (row.Materiaal ?? []).map((id) => ({ id, value: db[2].find((m) => m.id === id)?.Naam }));
    r.Aantal = String(row.Aantal); r["Aantal terug"] = String(row["Aantal terug"] ?? 0);
    r.Uitstaand = String(Number(row.Aantal) - Number(row["Aantal terug"] ?? 0));
  }
  return r;
};
const val = (t, row, f) => {
  const x = expand(t, row)[f];
  if (Array.isArray(x)) return x.map((e) => e.id);
  return x && typeof x === "object" ? x.value : x;
};
const norm = (body, t) => { // incoming: select by string, links as id arrays
  const b = { ...body };
  return b;
};

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const m = u.pathname.match(/^\/api\/database\/rows\/table\/(\d+)\/(batch-delete\/|batch\/|(\d+)\/)?$/);
  const send = (code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(body === undefined ? "" : JSON.stringify(body)); };
  if (!m) return send(404, { error: "nope" });
  if (!(req.headers.authorization ?? "").startsWith("Token ")) return send(401, { error: "auth" });
  const t = Number(m[1]);
  let body = "";
  for await (const c of req) body += c;
  body = body ? JSON.parse(body) : {};
  const log = `${req.method} ${u.pathname}${u.search}`;
  console.log(log);

  if (req.method === "GET") {
    let rows = db[t];
    for (const [k, v] of u.searchParams) {
      const f = k.match(/^filter__(.+)__(\w+)$/);
      if (!f) continue;
      const [, field, type] = f;
      rows = rows.filter((r) => {
        const x = val(t, r, field);
        switch (type) {
          case "contains": return String(x ?? "").toLowerCase().includes(v.toLowerCase());
          case "equal": return String(x) === v;
          case "boolean": return String(x) === v;
          case "higher_than": return Number(x) > Number(v);
          case "link_row_has": return (x ?? []).includes(Number(v));
          default: return true;
        }
      });
    }
    return send(200, { count: rows.length, next: null, results: rows.map((r) => expand(t, r)) });
  }
  if (req.method === "POST" && m[2] === "batch/") return send(200, { items: body.items.map((i) => expand(t, add(t, norm(i, t)))) });
  if (req.method === "POST" && m[2] === "batch-delete/") { db[t] = db[t].filter((r) => !body.items.includes(r.id)); return send(204); }
  if (req.method === "POST") return send(200, expand(t, add(t, norm(body, t))));
  if (req.method === "PATCH" && m[2] === "batch/") {
    for (const i of body.items) Object.assign(db[t].find((r) => r.id === i.id), i);
    return send(200, { items: [] });
  }
  if (req.method === "DELETE") { db[t] = db[t].filter((r) => r.id !== Number(m[3])); return send(204); }
  send(405, {});
}).listen(4010, () => console.log("mock baserow on :4010"));
