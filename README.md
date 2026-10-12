# Materiaalhok

Mobile web app for lending equipment from the materiaalhok (Sport & Bewegen). Teachers scan a QR code, fill a basket, pick their own return date and confirm with a press-and-hold pledge. Data lives in Baserow; mails go through Resend.

Design/behaviour spec: `HANDOFF.md` and `Starter prompt.md`. Reference prototype: `prototype/`.

## Stack
Next.js 16 (App Router, TypeScript) · Baserow REST API (server-side only) · Resend · Vercel Cron.

## Setup

1. **Baserow tables.** Create an empty database in Baserow, then:
   ```bash
   cp .env.example .env.local     # fill BASEROW_URL, BASEROW_EMAIL, BASEROW_PASSWORD, BASEROW_DATABASE_ID
   npm run setup:baserow          # add -- --no-sample to skip example data
   ```
   (`node --env-file=.env.local scripts/setup-baserow.mjs`). It creates the tables Categorieën, Materiaal, Leningen, Leenregels with all fields, example items, and prints the table ids plus a database token. Prefer manual setup? Create the same tables/fields (names in `src/lib/fields.ts`; Leenregels also has a formula field `Uitstaand` = `field('Aantal') - field('Aantal terug')`).
2. **Env vars** in `.env.local` (see `.env.example`):

   | Variable | Purpose |
   |---|---|
   | `BASEROW_URL`, `BASEROW_TOKEN` | Baserow host and database token |
   | `BASEROW_TABLE_CATEGORIEEN` / `_MATERIAAL` / `_LENINGEN` / `_LEENREGELS` | table ids |
      | `RESEND_API_KEY`, `MAIL_FROM` | mail (without a key, mails are logged to the console) |
   | `ADMIN_EMAIL` | reply-to on all mails + daily overdue overview |
   | `CRON_SECRET` | protects `/api/cron/reminders` |
   | `MAX_DAYS` | furthest selectable return date (default 14) |
3. `npm install && npm run dev`, open http://localhost:3000. Print a QR code pointing at the production URL.

## Managing (in Baserow)
- **Stock / items / photos:** edit `Materiaal` (`Voorraad`, `Foto`, `Actief`). Photos use Baserow's thumbnails in lists, the original on the detail page. Category order: `Volgorde`.
- **Returns:** directly in Baserow. If you only change `Single select` there, also set `Aantal terug`; availability is computed from open loans' `Aantal − Aantal terug`.
- "Beschadigd" counts everything as returned; adjust `Voorraad` yourself if items are lost.

## How it works
- Availability = `Voorraad` − outstanding units of loans with status Open/Deels terug, computed server-side, cached 30 s (and dropped on every loan/return). Re-checked without cache when a loan is created; if something was lent in the meantime the lender gets a message and a refreshed basket.
- Baserow has no transactions: loan row first, then the lines in one batch call; on failure the loan row is deleted.
- **Cron:** `vercel.json` calls `/api/cron/reminders` at 05:30 and 06:30 UTC; the route only proceeds when it is 07:xx in Amsterdam (so it's 07:30 year-round) and skips loans already reminded today (`Laatste herinnering`). Auth: `Authorization: Bearer $CRON_SECRET` (Vercel adds it when `CRON_SECRET` is set). Manual run: `curl -H "Authorization: Bearer $CRON_SECRET" "<site-url>/api/cron/reminders?force=1"`.

## Not verified
Built and type-checked (`npm run build`), but not yet run against a live Baserow instance or Resend account. Check on first run: the setup script (Baserow versions differ slightly in table/field API details), the `Status contains` and `Uitstaand higher_than` filters, and mail delivery.
# materiaalhok
