import type { Metadata } from "next";
import { todayNL } from "@/lib/dates";
import { activeLoans } from "@/lib/loans";
import Returns from "./Returns";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Beheer · Materiaalhok", robots: { index: false, follow: false } };

export default async function Page() {
  return <Returns loans={await activeLoans()} today={todayNL()} />;
}
