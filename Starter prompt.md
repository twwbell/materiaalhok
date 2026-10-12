# Starter prompt — Materiaalhok uitleen-app

Bouw een mobiele web-app (geen installatie, geopend via een QR-code in het materiaalhok) waarmee docenten van de opleiding Sport & Bewegen materiaal lenen en zelf afspreken wanneer ze het terugbrengen. Doel: een zo laagdrempelig mogelijke manier om commitment te creëren om het materiaal terug te brengen.

## Stack (voorstel)
- Next.js (App Router, TypeScript), mobile-first
- **Baserow** als database (cloud of self-hosted), aangesproken via de Baserow REST API (`/api/database/rows/table/{table_id}/?user_field_names=true`, header `Authorization: Token <BASEROW_TOKEN>`). Alleen server-side aanroepen (Next.js route handlers / server actions); de token komt nooit in de browser.
- De beheerder gebruikt de Baserow-interface zelf als beheeromgeving: voorraad aanpassen, foto's uploaden, leningen bekijken en terugmelden.
- Transactionele mail via Resend (of vergelijkbaar)
- Dagelijkse cronjob (bijv. Vercel Cron, 07:30) voor herinneringen: haal via de API met filters leningen op met Status Open/Deels terug en Terugbrengen vóór < vandaag
- Geen login voor leners; geen beheer-UI (beheer via database + links in mail)

## Datamodel (Baserow-tabellen)
- **Categorieën**: Naam (text, primary), Volgorde (number)
- **Materiaal**: Naam (text, primary), Categorie (link → Categorieën), Voorraad (number, totaal), Foto (file), Actief (boolean)
- **Leningen**: Nummer (autonumber, primary), Naam lener (text), E-mail (email), Terugbrengen vóór (date), Status (single select: `Open` · `Terug` · `Deels terug` · `Beschadigd`), Aangemaakt (created on), Teruggemeld op (date), Beheertoken (text, random, voor beheerlinks), Laatste herinnering (date)
- **Leenregels**: Lening (link → Leningen), Materiaal (link → Materiaal), Aantal (number), Aantal terug (number)
- Beschikbaarheid = Voorraad − som(Aantal − Aantal terug) van leenregels bij leningen met status Open/Deels terug. Bereken dit server-side en cache het kort (bijv. 30 s), zodat de catalogus snel blijft. Bij uitgeleende items tonen: "Uitgeleend · terug [vroegste Terugbrengen vóór]".
- Foto's: gebruik de thumbnail-URL's die Baserow bij het file-veld meelevert (klein voor de lijst, groot/origineel voor de detailpagina en de vergroting).
- Bij het aanmaken van een lening: controleer de beschikbaarheid opnieuw en maak daarna de Lening-rij en de Leenregels aan (batch-endpoint `/batch/`). Baserow heeft geen transacties; ruim bij een fout de half aangemaakte rijen op.
- Terugmelden mag op twee manieren: via de beheerlinks in de mail (route handler zet Status/Aantal terug via de API) of direct in Baserow door de beheerder.

## Schermen en gedrag
1. **Assortiment** (startscherm)
   - Kop "Materiaalhok", mandje-knop met badge (aantal).
   - Zoekveld dat de lijst live filtert.
   - Eén lange doorscrollbare lijst met alle items, gegroepeerd per categorie (kop per categorie).
   - Sticky categoriebalk bovenaan (horizontaal scrollbare pills). De categorie waar je nu scrollt is gehighlight (scroll-spy) en schuift in beeld. Tik op een categorie → lijst scrollt versneld (eased, ~300–450 ms) naar die sectie.
   - Per item: foto/placeholder, naam, beschikbaarheid ("12 beschikbaar", "Nog 2 beschikbaar" in oker, "Uitgeleend · terug do 15 okt" gedimd), ronde "+"-knop; na toevoegen een stepper (− aantal +), max = beschikbaar.
   - Zwevende knop "Bekijk mandje · n items" schuift in beeld zodra het mandje niet leeg is.
2. **Mandje**: lijst met steppers, "Nog iets toevoegen", hint dat je bij de volgende stap zelf de terugbrengdatum kiest. CTA "Verder naar lenen".
3. **Lenen (check-out)**
   - 1 Jouw gegevens: naam, school-e-mail, "Onthoud mij op dit apparaat" (localStorage).
   - 2 Terugbrengdatum: horizontale strip met de komende 14 dagen (Vandaag, Morgen, wo 14…), weekend uitgeschakeld (hok dicht). Max termijn configureerbaar.
   - 3 Spelregels:
     1. Zelf terugbrengen naar het materiaalhok, niet in een lokaal of de gang.
     2. In goede staat: schoon, compleet en opgeruimd terug.
     3. Kapot of kwijt? Meld het direct bij de beheerder.
     4. Niet doorlenen. Jij blijft verantwoordelijk.
     5. Te laat? Je krijgt elke ochtend een herinnering.
   - "Jouw afspraak": "Ik, [naam], breng deze [n] items zelf terug naar het materiaalhok vóór [dag datum]."
   - Bevestigen door de knop **ingedrukt te houden** (~1,1 s, voortgangsbalk vult in oker; loslaten = terugveren). Validatie (naam, geldig e-mail, datum) vóór het vasthouden; fouten inline tonen.
   - Server: controleer beschikbaarheid opnieuw (race conditions), maak loan + loan_items aan, verstuur mail 1.
4. **Bevestiging**: okergeel blok "Terug in het hok vóór [donderdag 15 oktober]", lijst geleende items, "Bevestiging verstuurd naar …", knop "Zet in mijn agenda" (.ics, hele dag, alarm), knop "Klaar" (mandje leeg, terug naar assortiment).

## Mails
- **Mail 1 — direct na lenen.** Onderwerp: "Je hebt materiaal geleend, terug vóór [datum]". Inhoud: afspraak-blok met datum, lijst items, spelregel-samenvatting, "Kapot of kwijt? Reageer op deze mail" (reply-to = beheerder). Onderaan beheerlinks: **Alles terug**, **Deels terug**, **Beschadigd** (URL met admin_token; deels terug → simpel formulier met aantallen per item).
- **Mail 2 — herinnering.** Dagelijks om 07:30 voor elke lening met status `open`/`partial` en return_date < vandaag. Onderwerp: "Herinnering: [item] is [n] dag(en) te laat". Toon alleen nog niet teruggebrachte items. Stopt zodra alles is teruggemeld. Beheerder krijgt optioneel een dagelijks overzicht van alle te late leningen.

## Visuele stijl
- Kleuren: achtergrond #faf7f2, tekst #221a33, paars #5b2a86 (primair; hover #4b2170, donker #3d1a5c, tint #efe6f6), okergeel #d9a21b (highlight/actieve categorie; tint #f8ecc9, tekst-op-tint #7a5a08), muted tekst #645a70, lijnen #ece5ef, fout #b3261e.
- Typografie: Lexend (koppen, knoppen, cijfers), Nunito Sans (tekst).
- Afgeronde vormen: knoppen pill (30px), kaarten 18–20px, item-tegels 16px. Hit targets ≥ 44px.
- Primaire knop: paars pill met witte tekst links uitgelijnd en een okergele ronde pijl rechts.

## Niet nu
Login/SSO, eigen beheer-dashboard (Baserow is de beheeromgeving), reserveren vooruit.

Lever: werkende app, een setup-beschrijving of -script voor de Baserow-tabellen en velden (plus voorbeelddata), mailtemplates, cron-route, en een README met setup en env-variabelen (`BASEROW_URL`, `BASEROW_TOKEN`, tabel-id's, mail-API-key, cron-secret).
