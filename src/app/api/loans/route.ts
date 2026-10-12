import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
import { createLoan, LoanError } from "@/lib/loans";
import { sendLoanConfirmation } from "@/lib/mail";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const loan = await createLoan(await req.json());
    // Loan is saved; a failing mail must not make the lender think it failed.
    await sendLoanConfirmation(loan).catch((e) => console.error("mail failed", e));
    return NextResponse.json({ ok: true, due: loan.due });
  } catch (e) {
    if (e instanceof LoanError) {
      const catalog = e.status === 409 ? await getCatalog(true).catch(() => null) : null;
      return NextResponse.json({ ok: false, error: e.message, catalog }, { status: e.status });
    }
    console.error(e);
    return NextResponse.json({ ok: false, error: "Er ging iets mis. Probeer het zo nog eens." }, { status: 500 });
  }
}
