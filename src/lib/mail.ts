import "server-only";
import { diffDays, fmtLong, fmtShort } from "./dates";
import type { Loan } from "./types";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const first = (name: string) => name.trim().split(/\s+/)[0] || "";
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function send(to: string, subject: string, html: string, replyTo?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[mail:dev] to=${to} subject=${subject}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? "Materiaalhok <onboarding@resend.dev>",
      to,
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

function shell(header: { bg: string; fg: string; kicker: string; kickerColor: string; title: string }, body: string) {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#faf7f2;font-family:'Nunito Sans',Arial,sans-serif;color:#221a33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" style="max-width:560px;width:100%;background:#fff;border-radius:20px;overflow:hidden">
<tr><td style="background:${header.bg};color:${header.fg};padding:22px 24px">
<div style="font:700 12px Lexend,Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:${header.kickerColor}">${header.kicker}</div>
<div style="font:700 24px/1.15 Lexend,Arial,sans-serif;margin-top:4px">${header.title}</div></td></tr>
<tr><td style="padding:20px 24px 24px;font-size:15px;line-height:1.5">${body}</td></tr>
</table></td></tr></table></body></html>`;
}

const itemRows = (lines: { name: string; qty: number }[]) =>
  `<table role="presentation" width="100%" style="border-collapse:collapse;margin:14px 0">${lines
    .map((l) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee8f0">${esc(l.name)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #eee8f0;font-weight:800">${l.qty}×</td></tr>`)
    .join("")}</table>`;

export async function sendLoanConfirmation(loan: Loan) {
  const link = (anchor: string) => `${appUrl()}/beheer/${loan.token}#${anchor}`;
  const html = shell(
    { bg: "#5b2a86", fg: "#fff", kicker: "Materiaalhok", kickerColor: "#f1d58a", title: `Hoi ${esc(first(loan.name))}, veel plezier met de les!` },
    `<div style="padding:14px 16px;border-radius:14px;background:#f8ecc9">
<div style="font:700 12px Lexend,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#7a5a08">Jouw afspraak</div>
<div style="font:700 19px Lexend,Arial,sans-serif">Terug in het hok vóór ${esc(fmtLong(loan.due))}</div></div>
${itemRows(loan.lines)}
<p style="color:#463d52;margin:0 0 16px">Breng alles zelf terug, schoon en compleet. Kapot of kwijt? Reageer op deze mail.</p>
<ul style="color:#463d52;padding-left:18px;margin:0 0 16px;font-size:14px">
<li>Zelf terugbrengen naar het materiaalhok, niet in een lokaal of de gang.</li>
<li>In goede staat: schoon, compleet en opgeruimd.</li>
<li>Niet doorlenen. Jij blijft verantwoordelijk.</li>
<li>Te laat? Je krijgt elke ochtend een herinnering.</li></ul>
<div style="font-size:12px;color:#8a8096;padding-top:12px;border-top:1px dashed #ddd3e2">Alleen voor de beheerder:
<a href="${link("terug")}" style="color:#5b2a86">Alles terug</a> · <a href="${link("deels")}" style="color:#5b2a86">Deels terug</a> · <a href="${link("beschadigd")}" style="color:#5b2a86">Beschadigd</a></div>`,
  );
  await send(loan.email, `Je hebt materiaal geleend, terug vóór ${fmtShort(loan.due)}`, html, process.env.ADMIN_EMAIL);
}

export async function sendReminder(loan: Loan, today: string) {
  const days = diffDays(today, loan.due);
  const head = loan.lines[0].name.toLowerCase() + (loan.lines.length > 1 ? " (en meer)" : "");
  const html = shell(
    { bg: "#d9a21b", fg: "#221a33", kicker: `Herinnering · dag ${days}`, kickerColor: "#221a33", title: `${esc(first(loan.name))}, we missen nog iets in het hok` },
    `<p style="margin:0 0 8px;color:#463d52">Je zou de spullen vóór ${esc(fmtLong(loan.due))} terugbrengen. Ze zijn nog niet teruggemeld.</p>
${itemRows(loan.lines.map((l) => ({ name: l.name, qty: l.qty - l.returned })))}
<p style="color:#463d52">Breng ze vandaag terug. Weet je niet meer waar ze zijn, of is er iets kapot? Reageer op deze mail.</p>
<div style="font-size:12px;color:#8a8096">Je ontvangt deze mail elke ochtend tot alles is teruggemeld.</div>`,
  );
  await send(loan.email, `Herinnering: ${head} is ${days} ${days === 1 ? "dag" : "dagen"} te laat`, html, process.env.ADMIN_EMAIL);
}

export async function sendAdminOverview(loans: Loan[], today: string) {
  const to = process.env.ADMIN_EMAIL;
  if (!to || !loans.length) return;
  const rows = loans
    .map((l) => `<p style="margin:0 0 12px"><strong>${esc(l.name)}</strong> (${esc(l.email)}) · ${diffDays(today, l.due)} dag(en) te laat<br>
${l.lines.map((x) => `${x.qty - x.returned}× ${esc(x.name)}`).join(", ")}<br>
<a href="${appUrl()}/beheer/${l.token}" style="color:#5b2a86">Terugmelden</a></p>`)
    .join("");
  await send(
    to,
    `Te laat: ${loans.length} ${loans.length === 1 ? "lening" : "leningen"}`,
    shell({ bg: "#5b2a86", fg: "#fff", kicker: "Materiaalhok", kickerColor: "#f1d58a", title: "Overzicht te late leningen" }, rows),
  );
}
