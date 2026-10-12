#!/usr/bin/env node
// Creates the four Materiaalhok tables (+ fields + example data) in an existing Baserow database.
// Needs a JWT login (a database token cannot create tables):
//   BASEROW_URL, BASEROW_EMAIL, BASEROW_PASSWORD, BASEROW_DATABASE_ID
// Usage: node --env-file=.env.local scripts/setup-baserow.mjs [--no-sample]
// Prints the table ids and a database token to paste into .env.local.

const url = (process.env.BASEROW_URL || "https://api.baserow.io").replace(/\/$/, "");
const { BASEROW_EMAIL: email, BASEROW_PASSWORD: password, BASEROW_DATABASE_ID: dbId } = process.env;
const sample = !process.argv.includes("--no-sample");
if (!email || !password || !dbId) {
  console.error("Set BASEROW_EMAIL, BASEROW_PASSWORD and BASEROW_DATABASE_ID (and BASEROW_URL).");
  process.exit(1);
}

let jwt = "";
async function api(path, method = "GET", body) {
  const res = await fetch(url + path, {
    method,
    headers: { "Content-Type": "application/json", ...(jwt ? { Authorization: `JWT ${jwt}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const login = await api("/api/user/token-auth/", "POST", { email, password });
jwt = login.access_token || login.token;

async function table(name, primary) {
  // Passing data with first_row_header creates a table with just one text field: the primary one.
  const t = await api(`/api/database/tables/database/${dbId}/`, "POST", { name, data: [[primary]], first_row_header: true });
  const rows = await api(`/api/database/rows/table/${t.id}/?size=100`, "GET");
  for (const r of rows.results) await api(`/api/database/rows/table/${t.id}/${r.id}/`, "DELETE");
  const fields = await api(`/api/database/fields/table/${t.id}/`);
  return { id: t.id, primaryId: fields.find((f) => f.primary).id };
}
const field = (t, body) => api(`/api/database/fields/table/${t}/`, "POST", body);
const rows = (t, items) => api(`/api/database/rows/table/${t}/batch/?user_field_names=true`, "POST", { items });

console.log("Creating tables…");
const cat = await table("Categorieën", "Naam");
const mat = await table("Materiaal", "Naam");
const loan = await table("Leningen", "Nummer");
const line = await table("Leenregels", "Regel");

await field(cat.id, { name: "Volgorde", type: "number", number_decimal_places: 0 });

await field(mat.id, { name: "Categorie", type: "link_row", link_row_table_id: cat.id, has_related_field: false });
await field(mat.id, { name: "Voorraad", type: "number", number_decimal_places: 0 });
await field(mat.id, { name: "Foto", type: "file" });
await field(mat.id, { name: "Actief", type: "boolean" });

await api(`/api/database/fields/${loan.primaryId}/`, "PATCH", { name: "Nummer", type: "autonumber" });
await field(loan.id, { name: "Naam lener", type: "text" });
await field(loan.id, { name: "E-mail", type: "email" });
await field(loan.id, { name: "Terugbrengen vóór", type: "date", date_format: "ISO" });
await field(loan.id, {
  name: "Status",
  type: "single_select",
  select_options: [
    { value: "Open", color: "light-blue" },
    { value: "Terug", color: "light-green" },
    { value: "Deels terug", color: "light-orange" },
    { value: "Beschadigd", color: "light-red" },
  ],
});
await field(loan.id, { name: "Aangemaakt", type: "created_on", date_include_time: true, date_format: "ISO" });
await field(loan.id, { name: "Teruggemeld op", type: "date", date_format: "ISO" });
await field(loan.id, { name: "Beheertoken", type: "text" });
await field(loan.id, { name: "Laatste herinnering", type: "date", date_format: "ISO" });

// Leenregels: primary is a formula-less text we leave empty; keep it for Baserow's requirement.
await field(line.id, { name: "Lening", type: "link_row", link_row_table_id: loan.id, has_related_field: true });
await field(line.id, { name: "Materiaal", type: "link_row", link_row_table_id: mat.id, has_related_field: false });
await field(line.id, { name: "Aantal", type: "number", number_decimal_places: 0 });
await field(line.id, { name: "Aantal terug", type: "number", number_decimal_places: 0 });
await field(line.id, { name: "Uitstaand", type: "formula", formula: "field('Aantal') - field('Aantal terug')" });

if (sample) {
  console.log("Adding example data…");
  const CATS = ["Balsporten", "Turnen", "Atletiek", "Kleine materialen", "Spel & tikken"];
  const ITEMS = [
    ["Voetbal (maat 5)", 0, 20], ["Basketbal", 0, 12], ["Volleybal", 0, 10], ["Handbal", 0, 14], ["Korfbalpaal + korf", 0, 4], ["Tennisrackets (set van 4)", 0, 3],
    ["Springplank", 1, 2], ["Turnmat (dun)", 1, 8], ["Bok", 1, 1], ["Kast (5-delig)", 1, 2],
    ["Hordes (set van 6)", 2, 3], ["Estafettestokjes", 2, 16], ["Meetlint 50 m", 2, 2], ["Startblokken", 2, 4],
    ["Pionnen (set van 20)", 3, 6], ["Hesjes (set van 10)", 3, 5], ["Fluitje", 3, 10], ["Stopwatch", 3, 8], ["Ballenpomp", 3, 3],
    ["Frisbees", 4, 15], ["Pittenzakjes", 4, 30], ["Springtouwen", 4, 20], ["Parachute", 4, 1],
  ];
  const c = await rows(cat.id, CATS.map((Naam, i) => ({ Naam, Volgorde: i + 1 })));
  const m = await rows(mat.id, ITEMS.map(([Naam, ci, Voorraad]) => ({ Naam, Categorie: [c.items[ci].id], Voorraad, Actief: true })));
  const idOf = (n) => m.items[ITEMS.findIndex((i) => i[0] === n)].id;

  const nextWeekday = (plus) => {
    const d = new Date();
    d.setDate(d.getDate() + plus);
    while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  const l = await rows(loan.id, [
    { "Naam lener": "Voorbeeld Docent", "E-mail": "docent@example.nl", "Terugbrengen vóór": nextWeekday(3), Status: "Open", Beheertoken: "voorbeeld-token-1" },
  ]);
  await rows(line.id, [
    { Lening: [l.items[0].id], Materiaal: [idOf("Bok")], Aantal: 1, "Aantal terug": 0 },
    { Lening: [l.items[0].id], Materiaal: [idOf("Startblokken")], Aantal: 2, "Aantal terug": 0 },
  ]);
}

let key = "";
try {
  const apps = await api("/api/applications/");
  const workspace = apps.find((a) => String(a.id) === String(dbId))?.workspace?.id;
  key = (await api("/api/database/tokens/", "POST", { name: "Materiaalhok app", workspace })).key;
} catch (e) {
  console.warn("Could not create a database token automatically; create one in Baserow (Settings > Database tokens).", e.message);
}

console.log(`
Done. Add to .env.local:

BASEROW_URL=${url}
BASEROW_TOKEN=${key}
BASEROW_TABLE_CATEGORIEEN=${cat.id}
BASEROW_TABLE_MATERIAAL=${mat.id}
BASEROW_TABLE_LENINGEN=${loan.id}
BASEROW_TABLE_LEENREGELS=${line.id}
`);
