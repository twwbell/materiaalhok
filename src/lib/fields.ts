// Field names in Baserow (user_field_names=true). Keep in sync with scripts/setup-baserow.mjs.
export const F = {
  cat: { name: "Naam", order: "Volgorde" },
  mat: { name: "Naam", cat: "Categorie", stock: "Voorraad", photo: "Foto", active: "Actief" },
  loan: {
    number: "Nummer",
    name: "Naam lener",
    email: "E-mail",
    due: "Terugbrengen voor",
    status: "Single select",
    createdAt: "Aangemaakt op",
    returnedOn: "Teruggemeld op",
    lastReminder: "Laatste herinnering",
  },
  line: { title: "Regel", loan: "Lening", mat: "Materiaal", qty: "Aantal", back: "Aantal terug", open: "Formula" },
} as const;
