// Field names in Baserow (user_field_names=true). Keep in sync with scripts/setup-baserow.mjs.
export const F = {
  cat: { name: "Naam", order: "Volgorde" },
  mat: { name: "Naam", cat: "Categorie", stock: "Voorraad", photo: "Foto", active: "Actief" },
  loan: {
    number: "Nummer",
    name: "Naam lener",
    email: "E-mail",
    due: "Terugbrengen vóór",
    status: "Status",
    createdAt: "Aangemaakt",
    returnedOn: "Teruggemeld op",
    token: "Beheertoken",
    lastReminder: "Laatste herinnering",
  },
  line: { loan: "Lening", mat: "Materiaal", qty: "Aantal", back: "Aantal terug", open: "Uitstaand" },
} as const;
