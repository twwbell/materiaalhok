import App from "@/components/App";
import { getCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <App initial={await getCatalog()} />;
}
