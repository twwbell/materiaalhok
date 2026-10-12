"use client";

import { useState } from "react";
import { fmtShort } from "@/lib/dates";
import type { Loan } from "@/lib/types";

function LoanCard({ loan, today, onDone }: { loan: Loan; today: string; onDone: (id: number) => void }) {
  // qty per line that comes back now (defaults to everything outstanding)
  const [now, setNow] = useState<Record<number, number>>(() => Object.fromEntries(loan.lines.map((l) => [l.id, l.qty - l.returned])));
  const [damaged, setDamaged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const late = loan.due < today;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const back = Object.fromEntries(loan.lines.map((l) => [l.id, l.returned + (now[l.id] ?? 0)]));
      const res = await fetch("/api/beheer/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId: loan.id, back, damaged }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      onDone(loan.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis.");
      setBusy(false);
    }
  }

  return (
    <section style={{ background: "#fff", borderRadius: 16, boxShadow: "inset 0 0 0 1.5px var(--line2)", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <b style={{ font: "700 16px var(--head)" }}>{loan.name}</b>
        <span className="meta" style={late ? { color: "var(--err)", fontWeight: 700 } : undefined}>
          {late ? "Te laat · " : ""}{fmtShort(loan.due)}
        </span>
      </div>
      <p className="meta">{loan.email}</p>
      {loan.lines.map((l) => {
        const out = l.qty - l.returned;
        return (
          <label key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
            <span style={{ flex: 1 }}>{l.name} <span className="meta">({out} uit)</span></span>
            <input
              type="number" min={0} max={out} value={now[l.id] ?? 0} aria-label={`Terug: ${l.name}`}
              onChange={(e) => setNow({ ...now, [l.id]: Math.max(0, Math.min(out, Number(e.target.value) || 0)) })}
              style={{ width: 64, height: 40, borderRadius: 10, border: "1.5px solid var(--line2)", padding: "0 8px", font: "600 16px var(--body)" }}
            />
          </label>
        );
      })}
      <label className="meta" style={{ display: "flex", gap: 8, margin: "8px 0" }}>
        <input type="checkbox" checked={damaged} onChange={(e) => setDamaged(e.target.checked)} />
        Beschadigd of kwijt (pas daarna de voorraad aan)
      </label>
      {error && <p className="err">{error}</p>}
      <button className="btn-primary" onClick={submit} disabled={busy || !Object.values(now).some((n) => n > 0)}>
        {busy ? "Bezig…" : "Terugmelden"}
      </button>
    </section>
  );
}

export default function Returns({ loans, today }: { loans: Loan[]; today: string }) {
  const [done, setDone] = useState<number[]>([]);
  const shown = loans.filter((l) => !done.includes(l.id));
  return (
    <main className="screen">
      <div className="kicker">Beheer</div>
      <h1 className="title">Terugmelden</h1>
      {!shown.length && <p className="meta">Niets uitgeleend.</p>}
      {shown.map((l) => <LoanCard key={l.id} loan={l} today={today} onDone={(id) => setDone((d) => [...d, id])} />)}
    </main>
  );
}
