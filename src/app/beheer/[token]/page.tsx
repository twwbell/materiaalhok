import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { fmtLong } from "@/lib/dates";
import { applyReturn, getLoanByToken } from "@/lib/loans";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terugmelden · Materiaalhok", robots: { index: false } };

export default async function Beheer({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loan = await getLoanByToken(token);
  if (!loan) notFound();

  async function allBack() {
    "use server";
    const l = await getLoanByToken(token);
    if (l) await applyReturn(l, new Map(l.lines.map((x) => [x.id, x.qty])), "Terug");
    revalidatePath(`/beheer/${token}`);
  }
  async function damaged() {
    "use server";
    const l = await getLoanByToken(token);
    if (l) await applyReturn(l, new Map(l.lines.map((x) => [x.id, x.qty])), "Beschadigd");
    revalidatePath(`/beheer/${token}`);
  }
  async function partial(form: FormData) {
    "use server";
    const l = await getLoanByToken(token);
    if (l) await applyReturn(l, new Map(l.lines.map((x) => [x.id, Number(form.get(`line-${x.id}`) ?? x.returned)])));
    revalidatePath(`/beheer/${token}`);
  }

  const closed = loan.status === "Terug" || loan.status === "Beschadigd";

  return (
    <main className="screen admin">
      <div className="kicker">Beheer · lening #{loan.number}</div>
      <h1 className="title">{loan.name}</h1>
      <p className="meta">{loan.email} · terug vóór {fmtLong(loan.due)}</p>
      <p>Status: <strong>{loan.status}</strong></p>

      <ul className="admin-lines">
        {loan.lines.map((l) => (
          <li key={l.id}><span>{l.name}</span><strong>{l.returned}/{l.qty} terug</strong></li>
        ))}
      </ul>

      {closed ? (
        <p className="hint">Deze lening is afgesloten. Wijzigen kan in Baserow.</p>
      ) : (
        <>
          <form action={allBack} id="terug"><button className="btn-primary">Alles terug</button></form>
          <form action={partial} id="deels" className="card">
            <h2>Deels terug</h2>
            {loan.lines.map((l) => (
              <label key={l.id} className="admin-row">
                <span>{l.name}</span>
                <input type="number" name={`line-${l.id}`} min={0} max={l.qty} defaultValue={l.returned} inputMode="numeric" />
                <span className="meta">van {l.qty}</span>
              </label>
            ))}
            <button className="btn-soft">Opslaan</button>
          </form>
          <form action={damaged} id="beschadigd">
            <button className="btn-soft">Alles terug, maar beschadigd</button>
            <p className="meta">Zet de lening op “Beschadigd” en telt alles als teruggebracht. Pas zo nodig de voorraad aan in Baserow.</p>
          </form>
        </>
      )}
    </main>
  );
}
