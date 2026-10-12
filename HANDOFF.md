# Handoff: Materiaalhok uitleen-app (Sport & Bewegen)

## Overview
Mobile web app opened via a QR code in the equipment room ("materiaalhok"). Teachers pick equipment, put it in a basket, and at check-out enter their name/email and **choose their own return date**. They confirm a written pledge by press-and-hold. They receive a confirmation email, and a reminder email every morning while the loan is overdue. The admin marks returns via links in the email (no admin UI in scope).

Goal: a low-friction way to create real commitment to bring things back.

Database: **Baserow** (via its REST API, server-side only; Baserow's own UI is the admin backend). See `Starter prompt.md` for the stack, Baserow tables and fields, email and cron logic, and scope. This README covers the UI in detail.

## About the design files
The files in `prototype/` are **design references built in HTML**: a working prototype that shows the intended look and behavior. They are not production code. Recreate them in the target stack (proposed: Next.js + TypeScript) using its normal patterns. Open `prototype/Materiaalhok Lenen v2.dc.html` in a browser (keep `support.js` next to it). The phone frame and the emails on the right are presentation only.

## Fidelity
**High-fidelity.** Colors, typography, radii, spacing, copy and interactions are final for v1. Item photos are placeholders (tinted tile with the item's first letter).

## Design tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| bg | `#faf7f2` | App background, sticky bars |
| surface-white | `#ffffff` | Inputs, day cards, rules card, inactive pills |
| ink | `#221a33` | Primary text |
| ink-2 | `#463d52` | Labels, secondary body |
| muted | `#645a70` | Meta text, counts |
| muted-2 | `#8a8096` | Email meta, admin links line |
| purple | `#5b2a86` | Primary buttons, step numbers, selected day |
| purple-hover | `#4b2170` | Hover on primary |
| purple-dark | `#3d1a5c` | Text on purple tint |
| purple-ink | `#22102f` | Pledge text |
| purple-tint | `#efe6f6` | Stepper bg, cart icon button, pledge card |
| purple-tint-hover | `#e3d4f0` | |
| ochre | `#d9a21b` | Active category pill, cart badge, arrow circle in CTAs, hold-fill, success block, reminder header |
| ochre-tint | `#f8ecc9` | Info hint, rule number chips, email pledge block |
| ochre-ink | `#7a5a08` | Text on ochre tint |
| ochre-light | `#f1d58a` | Kicker on purple email header |
| line | `#ece5ef` | Row separators |
| line-strong | `#e6dfea` / `#e0d8e6` | Inset borders (pills, inputs, day cards) |
| status-ok | `#2e8b57` | Availability dot |
| status-low | `#d9a21b` | ≤ 2 left dot |
| error | `#b3261e` | Errors, "uitgeleend" dot (text `#8a2a22`) |

### Typography
- **Lexend** (500–800): headings, buttons, pills, numbers.
- **Nunito Sans** (400–800): body, inputs.
- Scale: screen title 28/1.05 700 (−0.02em) · section header 19 700 · sub-header title 20 700 · item name 16 700 · body 15 · meta 13 · kicker 12 700 uppercase +0.08–0.1em · success date 36/1.02 800 · day number 22 700.

### Radii
Pills/CTAs 30px (height 60) · small round buttons 22px (44×44) · category pills 19px (h 38) · cards 18–20px · item tile 16px (60×60) · inputs 14px (h 50) · day cards 18px (58×80) · step number 13px (26×26).

### Spacing
Screen side padding 20px. Item rows: 12px vertical, 14px gap. Check-out sections: 28px gap; inside 12px.

### Shadows
- Primary round "+": `0 4px 10px rgba(91,42,134,.25)`
- Floating cart bar: `0 12px 28px rgba(61,26,92,.35)`
- Borders are drawn as inset shadows: `inset 0 0 0 1.5px #e6dfea`; error `inset 0 0 0 2px #b3261e`.

## Screens

### 1. Assortiment (start)
- **Header** (not sticky): kicker "Sport & Bewegen" (purple), title "Materiaalhok". Right: 48×48 cart button (radius 16, purple-tint, bag icon), ochre count badge (22px, 2px bg-colored ring) when the basket isn't empty.
- **Search** (white, h48, r16, search icon): live filter on item name, clear "×" button. Sections without matches are hidden. Empty state: "Niets gevonden" / "Staat het niet in de lijst? Vraag het de beheerder."
- **Sticky category bar**: horizontally scrollable pills, gap 8, padding 8/20/12, bottom hairline. Active = ochre bg, ink text. Inactive = white with inset border.
- **List**: one long list of all categories. Each section has a header (name + "n items"), then item rows: tile · name · availability line (dot + text) · action.
  - Availability copy: `"{n} beschikbaar"` · `"Nog {n} beschikbaar"` (n ≤ 2, ochre dot) · `"Alles in je mandje"` · `"Uitgeleend · terug {do 15 okt}"` (row at 55% opacity, no add button).
  - Action: 44px purple round "+" → after adding, stepper pill (purple-tint, h44): white "−", qty (Lexend 16 700, purple-dark), purple "+". "+" at 35% opacity and disabled at max.
- **Floating cart bar** (absolute, 16px side insets, 28px from bottom): purple pill h60 "Bekijk mandje" + "n items" + ochre arrow circle. It slides in when the basket goes from empty to non-empty: `transform translateY(140%)→0`, `.35s cubic-bezier(.2,.9,.3,1.2)`.
- Extra bottom padding (≈340–420px) so the last category can scroll to the top.

### 1b. Product detail
- Opened by tapping an item's photo or name (in catalog or cart). Back returns to the origin screen; the catalog restores its scroll position.
- 350×350 photo (radius 24) with a 44px white round "enlarge" button bottom-right (maximize icon).
- Kicker = category (purple), name (Lexend 26/1.1 700), availability line with dot (same rules as the list; adds "· n in je mandje").
- Quantity card (white, r18): "Aantal" + stepper (h48), min 1, max = available.
- Footer CTA: "In mandje · n" (sets qty and goes back), or "Aantal bijwerken" if the item is already in the basket. Hidden when the item is fully lent out.
- **Lightbox**: full-screen overlay `rgba(13,10,18,.96)` with the item name, a close button (44px, white 14%), and the photo at full width. Tap toggles zoom `scale(1)↔scale(2)`, `.3s cubic-bezier(.2,.8,.2,1)`. Hint text "Tik om in te zoomen" / "Tik om uit te zoomen". In production also support pinch-zoom and pan.
- Photos: thumbnails in list (60px) and cart (52px), large on detail. Fallback = tinted tile with the first letter.

### 2. Mandje
- Sub-header: back chevron (44×44), title "Mandje", right "n items".
- Rows: 52px tile, name, category, stepper.
- "+ Nog iets toevoegen" ghost button → catalog.
- Ochre-tint hint card with undo icon: "Bij de volgende stap kies je zelf wanneer je dit terugbrengt naar het hok."
- Empty state: "Je mandje is leeg" + "Naar assortiment".
- Footer CTA: "Verder naar lenen".

### 3. Lenen (check-out)
Numbered sections (purple 26px circle + Lexend 17):
1. **Jouw gegevens**: Naam (autocomplete name), School-e-mail (type email). Checkbox "Onthoud mij op dit apparaat" (prefill from localStorage `mh_user` = {name,email}; saved on submit if checked, removed if unchecked).
2. **Wanneer breng je het terug?**: horizontal strip of today … today+maxDays (default 14). Labels: "Vandaag", "Morgen", then weekday short; day number; month short. Weekends disabled (35% opacity). Selected = purple bg, white text. Note: "Maximaal 14 dagen. In het weekend is het hok dicht."
3. **Spelregels**: white card, 5 rows with ochre-tint number chip:
   1. **Zelf terugbrengen** naar het materiaalhok, niet in een lokaal of de gang.
   2. **In goede staat:** schoon, compleet en opgeruimd terug.
   3. **Kapot of kwijt?** Meld het direct bij de beheerder.
   4. **Niet doorlenen.** Jij blijft verantwoordelijk.
   5. **Te laat?** Je krijgt elke ochtend een herinnering.
- **Jouw afspraak** card (purple-tint): "Ik, {naam}, breng deze {n} items zelf terug naar het materiaalhok vóór {woensdag 14 oktober}." (Lexend 17 600). With 1 item it reads "breng dit".
- **Footer: hold-to-confirm** (purple pill h60, hand icon): "Houd ingedrukt om te lenen". On pointerdown: if invalid → show errors and don't start. Otherwise an ochre fill grows left→right over **1100 ms** (linear), label "Blijf vasthouden…", text turns ink once the fill passes 50%. At 100%: "Afgesproken!", then submit after 180 ms. Releasing early (pointerup/leave) springs the fill back over ~250 ms. Disable the context menu and text selection, and set `touch-action:none`.
- Alternative (config flag): checkbox "Ik ga akkoord met deze afspraak" + normal "Lenen bevestigen" button.
- **Validation**: name non-empty; email `/^\S+@\S+\.\S+$/`; date chosen. Errors appear inline after the first attempt (red text 13 600, red inset border on the field or day cards).
- **Server**: re-check availability at submit and show a friendly error if something has meanwhile been lent out.

### 4. Bevestiging
- Full-width ochre block: 56px purple circle with check · "Gelukt, {voornaam}. Afgesproken:" · kicker "Terug in het hok vóór" · date (Lexend 36 800, e.g. "donderdag 15 oktober").
- "Je hebt geleend" list (name · "2×" in purple).
- Mail icon + "Bevestiging verstuurd naar **{email}**."
- "Zet in mijn agenda" (purple-tint pill, calendar icon) → downloads an .ics: all-day event on the return date, summary "Materiaal terugbrengen naar het hok", description = item list, alarm −1h.
- Footer "Klaar" → empty basket, back to catalog.

## Interactions

### Scroll-spy + category jump
- Active category = the last section whose top (relative to the scroll container, minus the sticky bar height) is ≤ scrollTop + 4. When scrolled to the bottom, force the last visible section.
- Clicking a pill animates the scroll to that section's top: duration `min(480, 200 + distance × 0.12)` ms, easeInOutCubic. Lock the scroll-spy during the animation.
- When the active category changes, scroll the pill bar horizontally so the active pill sits about 20px from the left (smooth).

### Navigation
catalog → (detail) → cart (bag icon or floating bar) → checkout → done. Back chevron: checkout→cart, cart→catalog. Reset scroll to top on every screen change.

## Emails (see prototype, right column)
- **Mail 1 (direct):** subject "Je hebt materiaal geleend, terug vóór {wo 14 okt}". Purple header with kicker "Materiaalhok" (ochre-light) + "Hoi {voornaam}, veel plezier met de les!". Ochre-tint pledge block "Terug in het hok vóór {datum}". Item list. Line "Breng alles zelf terug, schoon en compleet. Kapot of kwijt? Reageer op deze mail." Footer with admin links: Alles terug · Deels terug · Beschadigd.
- **Mail 2 (daily at 07:30 while overdue):** subject "Herinnering: {item} is {n} dag(en) te laat". Ochre header "Herinnering · dag {n}" + "{voornaam}, we missen nog iets in het hok". Body copy as in the prototype. Lists only items not yet returned.

## State (client)
`screen`, `activeCategory`, `detailItemId`, `detailFrom`, `detailQty`, `lightboxOpen`, `zoomed`, `cart: {itemId: qty}`, `query`, `name`, `email`, `remember`, `returnDate`, `tried` (show errors), `holdProgress` (0–1). Items and availability come from the server.

## Assets
- Icons: Lucide (shopping-bag, search, x, plus, minus, chevron-left, arrow-right, check, mail, calendar, undo-2, hand). Use `lucide-react`.
- Fonts: Google Fonts Lexend, Nunito Sans.
- Item photos: stored in the Baserow file field `Foto` on the Materiaal table. Use Baserow's small thumbnail for the list and cart, and the large or original image for the detail page and lightbox. Fallback = tinted letter tile (categories alternate purple-tint/ochre-tint). In the prototype, photos can be dropped onto the detail image (`image-slot.js`, prototype-only).
- Colors and fonts are an original "purple & ochre" direction, not the school's official brand. Swap in official brand tokens if they become available.

## Files
- `prototype/Materiaalhok Lenen v2.dc.html`: hi-fi prototype (data, copy and interaction logic in the `<script data-dc-script>` block at the bottom)
- `prototype/support.js`: runtime needed to open the prototype
- `prototype/image-slot.js`: prototype-only photo drop slot (not for production)
- `Starter prompt.md`: build prompt with stack, data model, email/cron logic and scope
