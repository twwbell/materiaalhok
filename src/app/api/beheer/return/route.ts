import { NextResponse } from "next/server";
import { LoanError, returnLoan } from "@/lib/loans";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { loanId, back, damaged } = await req.json();
    if (!Number.isInteger(loanId) || typeof back !== "object" || !back) throw new LoanError("Ongeldig verzoek.");
    const status = await returnLoan(loanId, back, damaged === true);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    if (e instanceof LoanError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ ok: false, error: "Er ging iets mis." }, { status: 500 });
  }
}
