import { NextResponse } from "next/server";
import { hourNL, todayNL } from "@/lib/dates";
import { markReminded, overdueLoans } from "@/lib/loans";
import { sendAdminOverview, sendReminder } from "@/lib/mail";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Vercel cron is UTC; it fires at 05:30 and 06:30 UTC so one of them is 07:xx in Amsterdam all year.
  const force = new URL(req.url).searchParams.has("force");
  if (!force && hourNL() !== 7) return NextResponse.json({ skipped: "not 07:xx in Amsterdam" });

  const today = todayNL();
  const loans = (await overdueLoans(today)).filter((l) => l.lastReminder !== today);
  const sent: number[] = [];
  for (const loan of loans) {
    try {
      await sendReminder(loan, today);
      sent.push(loan.id);
    } catch (e) {
      console.error("reminder failed", loan.id, e);
    }
  }
  await markReminded(sent, today);
  if (loans.length) await sendAdminOverview(loans, today).catch((e) => console.error("overview failed", e));
  return NextResponse.json({ reminded: sent.length, overdue: loans.length });
}
