"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Calendar, Check, ChevronLeft, Hand, Mail, Maximize2, Minus, Plus, Search, ShoppingBag, Undo2, X } from "lucide-react";
import { addDays, fmt, fmtLong, fmtShort, isWeekend } from "@/lib/dates";
import type { Catalog, Item } from "@/lib/types";

type Screen = "catalog" | "detail" | "cart" | "checkout" | "done";
type Cart = Record<number, number>;

const TILES = [["#efe6f6", "#5b2a86"], ["#f8ecc9", "#7a5a08"]] as const;
const RULES = [
  ["Zelf terugbrengen", "naar het materiaalhok, niet in een lokaal of de gang."],
  ["In goede staat:", "schoon, compleet en opgeruimd terug."],
  ["Kapot of kwijt?", "Meld het direct bij de beheerder."],
  ["Niet doorlenen.", "Jij blijft verantwoordelijk."],
  ["Te laat?", "Je krijgt elke ochtend een herinnering."],
];
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const HOLD_MS = 1100;

function stockInfo(it: Item, inCart: number) {
  const left = it.available - inCart;
  if (it.available === 0) return { label: `Uitgeleend · terug ${it.back ? fmtShort(it.back) : "binnenkort"}`, dot: "#b3261e", out: true, left };
  if (left === 0) return { label: "Alles in je mandje", dot: "#d9a21b", out: false, left };
  if (left <= 2) return { label: `Nog ${left} beschikbaar`, dot: "#d9a21b", out: false, left };
  return { label: `${left} beschikbaar`, dot: "#2e8b57", out: false, left };
}

function Tile({ item, catIndex, small, onClick }: { item: Item; catIndex: number; small?: boolean; onClick: () => void }) {
  const [bg, fg] = TILES[catIndex % 2];
  return (
    <button className={`tile${small ? " sm" : ""}`} style={{ background: bg, color: fg }} onClick={onClick} aria-label={item.name}>
      {item.name[0]}
      {item.thumb && <img src={item.thumb} alt="" loading="lazy" />}
    </button>
  );
}

function Stepper({ qty, max, onChange, large }: { qty: number; max: number; onChange: (q: number) => void; large?: boolean }) {
  return (
    <div className={`stepper${large ? " lg" : ""}`}>
      <button className="minus" aria-label="Minder" onClick={() => onChange(qty - 1)}><Minus size={16} strokeWidth={2.6} /></button>
      <b>{qty}</b>
      <button className="plus" aria-label="Meer" disabled={qty >= max} onClick={() => onChange(qty + 1)}><Plus size={16} strokeWidth={2.6} /></button>
    </div>
  );
}

function Cta({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="footer">
      <button className="btn-primary" onClick={onClick} disabled={disabled}>
        {label}
        <span className="arrow"><ArrowRight size={20} strokeWidth={2.4} /></span>
      </button>
    </div>
  );
}

export default function App({ initial }: { initial: Catalog }) {
  const [catalog, setCatalog] = useState(initial);
  const { categories, items, today, maxDays } = catalog;
  const [screen, setScreen] = useState<Screen>("catalog");
  const [cart, setCart] = useState<Cart>({});
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState(categories[0]?.id ?? 0);
  const [detail, setDetail] = useState<{ id: number; from: Screen; qty: number } | null>(null);
  const [zoom, setZoom] = useState<"off" | "fit" | "in">("off");
  const [form, setForm] = useState({ name: "", email: "", remember: false, date: "" });
  const [tried, setTried] = useState(false);
  const [hold, setHold] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ name: string; email: string; date: string; lines: { name: string; qty: number }[] } | null>(null);

  const tabsRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const raf = useRef(0);
  const catScroll = useRef(0);
  const holdRaf = useRef<number | null>(null);
  const submitting = useRef(false);
  const holdVal = useRef(0);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const catIndex = useMemo(() => new Map(categories.map((c, i) => [c.id, i])), [categories]);
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartLines = items.filter((i) => cart[i.id]);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("mh_user") || "null");
      if (u?.name) setForm((f) => ({ ...f, name: u.name, email: u.email ?? "", remember: true }));
    } catch {}
  }, []);

  const go = useCallback((next: Screen) => {
    if (screen === "catalog") catScroll.current = window.scrollY;
    setScreen(next);
    setTried(false);
    setHold(0);
    setZoom("off");
  }, [screen]);

  useLayoutEffect(() => {
    window.scrollTo(0, screen === "catalog" ? catScroll.current : 0);
  }, [screen]);

  const setQty = (id: number, q: number) => {
    const max = byId.get(id)?.available ?? 0;
    setCart((c) => {
      const n = { ...c }, v = Math.max(0, Math.min(max, q));
      if (v) n[id] = v; else delete n[id];
      return n;
    });
  };
  const openDetail = (id: number) => { setDetail({ id, from: screen, qty: cart[id] || 1 }); go("detail"); };

  // --- catalog: search, scroll-spy, jump
  const q = query.trim().toLowerCase();
  const sections = categories
    .map((c) => ({ c, items: items.filter((i) => i.categoryId === c.id && (!q || i.name.toLowerCase().includes(q))) }))
    .filter((s) => s.items.length);

  const secTop = (id: number) => {
    const el = document.querySelector<HTMLElement>(`[data-sec="${id}"]`);
    if (!el) return null;
    return el.getBoundingClientRect().top + window.scrollY - (tabsRef.current?.offsetHeight ?? 0);
  };
  const setCat = useCallback((id: number) => {
    setActiveCat(id);
    const bar = tabsRef.current, tab = bar?.querySelector<HTMLElement>(`[data-tab="${id}"]`);
    if (bar && tab) bar.scrollTo({ left: tab.offsetLeft - 20, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (screen !== "catalog") return;
    const onScroll = () => {
      if (lock.current) return;
      let cur: number | null = null;
      for (const s of sections) {
        const t = secTop(s.c.id);
        if (t !== null && (cur === null || t <= window.scrollY + 4)) cur = s.c.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2 && sections.length) cur = sections[sections.length - 1].c.id;
      if (cur !== null && cur !== activeCat) setCat(cur);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  });

  const jumpTo = (id: number) => {
    const top = secTop(id);
    if (top === null) return;
    const from = window.scrollY;
    const to = Math.min(top + 2, document.documentElement.scrollHeight - window.innerHeight);
    const dur = Math.min(480, 200 + Math.abs(to - from) * 0.12), t0 = performance.now();
    lock.current = true;
    setCat(id);
    cancelAnimationFrame(raf.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      window.scrollTo(0, from + (to - from) * e);
      if (t < 1) raf.current = requestAnimationFrame(step); else lock.current = false;
    };
    raf.current = requestAnimationFrame(step);
  };

  // --- checkout
  const days = Array.from({ length: maxDays + 1 }, (_, n) => {
    const iso = addDays(today, n);
    return {
      iso, off: isWeekend(iso),
      wd: n === 0 ? "Vandaag" : n === 1 ? "Morgen" : fmt(iso, { weekday: "short" }),
      day: Number(iso.slice(8)), mon: fmt(iso, { month: "short" }),
    };
  });
  const errName = tried && !form.name.trim(), errEmail = tried && !EMAIL_RE.test(form.email.trim()), errDate = tried && !form.date;
  const pledge = `Ik, ${form.name.trim() || "…"}, breng ${cartCount === 1 ? "dit" : `deze ${cartCount} items`} zelf terug naar het materiaalhok uiterlijk op ${form.date ? fmtLong(form.date) : "[datum]"}.`;

  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, due: form.date, items: Object.entries(cart).map(([id, qty]) => ({ id: Number(id), qty })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.catalog) {
          const fresh: Catalog = data.catalog;
          setCatalog(fresh);
          setCart((c) => Object.fromEntries(Object.entries(c).map(([id, q]) => [id, Math.min(q, fresh.items.find((i) => i.id === Number(id))?.available ?? 0)]).filter(([, q]) => (q as number) > 0)));
        }
        setError(data.error || "Er ging iets mis. Probeer het zo nog eens.");
        setHold(0);
        return;
      }
      try {
        if (form.remember) localStorage.setItem("mh_user", JSON.stringify({ name: form.name.trim(), email: form.email.trim() }));
        else localStorage.removeItem("mh_user");
      } catch {}
      setDone({ name: form.name.trim(), email: form.email.trim(), date: form.date, lines: cartLines.map((i) => ({ name: i.name, qty: cart[i.id] })) });
      go("done");
    } catch {
      setError("Geen verbinding. Probeer het zo nog eens.");
      setHold(0);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const holdStart = () => {
    if (busy) return;
    if (!form.name.trim() || !EMAIL_RE.test(form.email.trim()) || !form.date) { setTried(true); return; }
    const t0 = performance.now();
    cancelAnimationFrame(holdRaf.current ?? 0);
    const step = (now: number) => {
      const h = Math.min(1, (now - t0) / HOLD_MS);
      holdVal.current = h;
      setHold(h);
      if (h < 1) holdRaf.current = requestAnimationFrame(step);
      else { holdRaf.current = null; setTimeout(submit, 180); }
    };
    holdRaf.current = requestAnimationFrame(step);
  };
  const holdEnd = () => {
    if (holdRaf.current === null) return;
    cancelAnimationFrame(holdRaf.current);
    holdRaf.current = null;
    const t0 = performance.now();
    const from = holdVal.current;
    const back = (now: number) => {
      const h = Math.max(0, from - (now - t0) / 250);
      holdVal.current = h;
      setHold(h);
      if (h > 0) requestAnimationFrame(back);
    };
    requestAnimationFrame(back);
  };

  const addToCalendar = () => {
    if (!done) return;
    const d = done.date.replace(/-/g, ""), nd = addDays(done.date, 1).replace(/-/g, "");
    const list = done.lines.map((l) => `${l.qty}x ${l.name}`).join("\\n");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Materiaalhok//NL", "BEGIN:VEVENT", `UID:${Date.now()}@materiaalhok`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, "")}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${nd}`,
      "SUMMARY:Materiaal terugbrengen naar het hok", `DESCRIPTION:${list}`, "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY",
      "DESCRIPTION:Materiaal terugbrengen", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = "materiaal-terugbrengen.ics";
    a.click();
  };

  const finish = () => {
    setCart({}); setDone(null); setQuery("");
    setForm((f) => ({ ...f, date: "" }));
    catScroll.current = 0;
    go("catalog");
  };

  const SubHeader = ({ title, back, right }: { title: string; back: () => void; right?: string }) => (
    <div className="sub">
      <button className="icon-btn" onClick={back} aria-label="Terug"><ChevronLeft size={22} strokeWidth={2.2} /></button>
      <h1>{title}</h1>
      {right && <span className="count">{right}</span>}
    </div>
  );
  const nItems = `${cartCount} ${cartCount === 1 ? "item" : "items"}`;

  // ---------- screens
  if (screen === "catalog")
    return (
      <div className="app">
        <div className="top">
          <div>
            <div className="kicker">Sport &amp; Bewegen</div>
            <div className="title">Materiaalhok</div>
          </div>
          <button className="cart-btn" onClick={() => go("cart")} aria-label="Mandje">
            <ShoppingBag size={22} strokeWidth={2} />
            {cartCount > 0 && <span className="badge">{cartCount}</span>}
          </button>
        </div>
        <label className="search">
          <Search size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek materiaal, bijv. pionnen" />
          {query && <button className="clear" aria-label="Wissen" onClick={() => setQuery("")}><X size={14} strokeWidth={2.5} /></button>}
        </label>
        <div className="tabs" ref={tabsRef}>
          {categories.map((c) => (
            <button key={c.id} data-tab={c.id} className={`tab${c.id === activeCat ? " on" : ""}`} onClick={() => jumpTo(c.id)}>{c.name}</button>
          ))}
        </div>
        {sections.map(({ c, items: its }) => (
          <div className="sec" key={c.id} data-sec={c.id}>
            <div className="sec-h"><h2>{c.name}</h2><span className="meta">{its.length} {its.length === 1 ? "item" : "items"}</span></div>
            {its.map((it) => {
              const qty = cart[it.id] || 0, s = stockInfo(it, qty);
              return (
                <div className={`row${s.out ? " out" : ""}`} key={it.id}>
                  <Tile item={it} catIndex={catIndex.get(it.categoryId) ?? 0} onClick={() => openDetail(it.id)} />
                  <button className="row-main" onClick={() => openDetail(it.id)}>
                    <span className="row-name">{it.name}</span>
                    <span className="stock"><i style={{ background: s.dot }} />{s.label}</span>
                  </button>
                  {qty === 0 && !s.out && <button className="add" aria-label="Toevoegen" onClick={() => setQty(it.id, 1)}><Plus size={20} strokeWidth={2.6} /></button>}
                  {qty > 0 && <Stepper qty={qty} max={it.available} onChange={(v) => setQty(it.id, v)} />}
                </div>
              );
            })}
          </div>
        ))}
        {!sections.length && (
          <div className="empty"><h2>Niets gevonden</h2><p className="meta" style={{ fontSize: 14 }}>Staat het niet in de lijst? Vraag het de beheerder.</p></div>
        )}
        <div style={{ height: cartCount ? 420 : 340 }} />
        <div className={`float${cartCount ? " in" : ""}`}>
          <button className="btn-primary" onClick={() => go("cart")}>
            Bekijk mandje <span className="sm">{nItems}</span>
            <span className="arrow"><ArrowRight size={20} strokeWidth={2.4} /></span>
          </button>
        </div>
      </div>
    );

  if (screen === "detail" && detail) {
    const it = byId.get(detail.id);
    if (!it) { go("catalog"); return null; }
    const inCart = cart[it.id] || 0, s = stockInfo({ ...it }, 0);
    const qty = Math.min(detail.qty, Math.max(it.available, 1));
    const back = () => go(detail.from === "cart" ? "cart" : "catalog");
    const [bg, fg] = TILES[(catIndex.get(it.categoryId) ?? 0) % 2];
    return (
      <div className="app">
        <SubHeader title="" back={back} />
        <div className="detail">
          <div className="photo" style={{ background: bg, color: fg }}>
            {it.name[0]}
            {it.large && <img src={it.large} alt={it.name} />}
            {it.large && <button className="zoom-btn" aria-label="Foto vergroten" onClick={() => setZoom("fit")}><Maximize2 size={20} strokeWidth={2.2} /></button>}
          </div>
          <div>
            <div className="kicker">{categories.find((c) => c.id === it.categoryId)?.name}</div>
            <h2 className="dname">{it.name}</h2>
            <div className="stock" style={{ fontSize: 14, marginTop: 6, color: s.out ? "#8a2a22" : undefined }}>
              <i style={{ background: s.dot, width: 8, height: 8 }} />
              {s.out ? `Uitgeleend · terug verwacht ${it.back ? fmtShort(it.back) : "binnenkort"}` : `${it.available} beschikbaar${inCart ? ` · ${inCart} in je mandje` : ""}`}
            </div>
          </div>
          {it.available > 0 && (
            <div className="qty-card">Aantal
              <div className="stepper lg">
                <button className="minus" aria-label="Minder" disabled={qty <= 1} onClick={() => setDetail({ ...detail, qty: qty - 1 })}><Minus size={16} strokeWidth={2.6} /></button>
                <b>{qty}</b>
                <button className="plus" aria-label="Meer" disabled={qty >= it.available} onClick={() => setDetail({ ...detail, qty: qty + 1 })}><Plus size={16} strokeWidth={2.6} /></button>
              </div>
            </div>
          )}
        </div>
        {it.available > 0 && <Cta label={inCart ? "Aantal bijwerken" : `In mandje · ${qty}`} onClick={() => { setQty(it.id, qty); back(); }} />}
        {zoom !== "off" && it.large && (
          <div className="lightbox">
            <header>{it.name}<button aria-label="Sluiten" onClick={() => setZoom("off")}><X size={20} strokeWidth={2.4} /></button></header>
            <div className="lb-stage" onClick={() => setZoom(zoom === "fit" ? "in" : "fit")} style={{ cursor: zoom === "fit" ? "zoom-in" : "zoom-out" }}>
              <img src={it.large} alt={it.name} style={{ transform: zoom === "in" ? "scale(2)" : "scale(1)" }} />
            </div>
            <div className="lb-hint">{zoom === "in" ? "Tik om uit te zoomen" : "Tik om in te zoomen"}</div>
          </div>
        )}
      </div>
    );
  }

  if (screen === "cart")
    return (
      <div className="app">
        <SubHeader title="Mandje" back={() => go("catalog")} right={cartCount ? nItems : ""} />
        {!cartLines.length ? (
          <div className="empty" style={{ padding: "48px 24px", gap: 14, alignItems: "flex-start" }}>
            <h2 style={{ fontSize: 20 }}>Je mandje is leeg</h2>
            <p className="meta" style={{ fontSize: 15 }}>Voeg materiaal toe uit het assortiment.</p>
            <button className="btn-pill" onClick={() => go("catalog")}>Naar assortiment</button>
          </div>
        ) : (
          <>
            <div className="cart-list">
              {cartLines.map((it) => (
                <div className="row" key={it.id} style={{ padding: "14px 0" }}>
                  <Tile item={it} catIndex={catIndex.get(it.categoryId) ?? 0} small onClick={() => openDetail(it.id)} />
                  <button className="row-main" onClick={() => openDetail(it.id)}>
                    <span className="row-name">{it.name}</span>
                    <span className="meta">{categories.find((c) => c.id === it.categoryId)?.name}</span>
                  </button>
                  <Stepper qty={cart[it.id]} max={it.available} onChange={(v) => setQty(it.id, v)} />
                </div>
              ))}
              <button className="btn-ghost" style={{ marginTop: 14 }} onClick={() => go("catalog")}><Plus size={18} strokeWidth={2.4} />Nog iets toevoegen</button>
            </div>
            <div className="hint"><Undo2 size={20} />Bij de volgende stap kies je zelf wanneer je dit terugbrengt naar het hok.</div>
            <div style={{ height: 24 }} />
            <Cta label="Verder naar lenen" onClick={() => go("checkout")} />
          </>
        )}
      </div>
    );

  if (screen === "checkout")
    return (
      <div className="app">
        <SubHeader title="Lenen" back={() => go("cart")} />
        <div className="co">
          <section>
            <h2><span className="step">1</span>Jouw gegevens</h2>
            <div className="field">
              <label htmlFor="n">Naam</label>
              <input id="n" type="text" className={errName ? "bad" : ""} value={form.name} autoComplete="name" placeholder="Voor- en achternaam" onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {errName && <div className="err">Vul je naam in.</div>}
            </div>
            <div className="field">
              <label htmlFor="e">School-e-mail</label>
              <input id="e" type="email" className={errEmail ? "bad" : ""} value={form.email} autoComplete="email" placeholder="naam@school.nl" onChange={(e) => setForm({ ...form, email: e.target.value })} />
              {errEmail && <div className="err">Vul een geldig e-mailadres in.</div>}
            </div>
            <label className="check"><input type="checkbox" checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} />Onthoud mij op dit apparaat</label>
          </section>
          <section>
            <h2><span className="step">2</span>Wanneer breng je het terug?</h2>
            <div className="days">
              {days.map((d) => (
                <button key={d.iso} disabled={d.off} className={`day${form.date === d.iso ? " on" : ""}${errDate ? " bad" : ""}`} onClick={() => setForm({ ...form, date: d.iso })}>
                  <span>{d.wd}</span><span>{d.day}</span><span>{d.mon}</span>
                </button>
              ))}
            </div>
            <div className="meta">Maximaal {maxDays} dagen. In het weekend is het hok dicht.</div>
            {errDate && <div className="err">Kies een dag waarop je het terugbrengt.</div>}
          </section>
          <section>
            <h2><span className="step">3</span>Spelregels</h2>
            <div className="rules">
              {RULES.map(([t, x], i) => <div className="rule" key={i}><i>{i + 1}</i><span><strong style={{ fontWeight: 800 }}>{t}</strong> {x}</span></div>)}
            </div>
          </section>
          <div className="pledge">
            <div className="kicker">Jouw afspraak</div>
            <p>{pledge}</p>
          </div>
          {error && <div className="err" role="alert" style={{ fontSize: 14 }}>{error}</div>}
        </div>
        <div className="footer">
          <button className="hold" disabled={busy}
            onPointerDown={holdStart} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd}
            onContextMenu={(e) => e.preventDefault()}>
            <span className="fill" style={{ width: `${Math.round(hold * 100)}%` }} />
            <span className="lbl" style={{ color: hold > 0.5 ? "#221a33" : "#fff" }}>
              <Hand size={20} strokeWidth={2.2} />
              {busy ? "Even geduld…" : hold >= 1 ? "Afgesproken!" : hold > 0 ? "Blijf vasthouden…" : "Houd ingedrukt om te lenen"}
            </span>
          </button>
        </div>
      </div>
    );

  if (screen === "done" && done)
    return (
      <div className="app">
        <div className="done-hero">
          <div className="check-c"><Check size={28} strokeWidth={3} /></div>
          <div style={{ font: "700 16px var(--head)" }}>Gelukt, {done.name.split(/\s+/)[0] || "top"}. Afgesproken:</div>
          <div>
            <div style={{ font: "700 13px var(--head)", letterSpacing: ".08em", textTransform: "uppercase" }}>Uiterlijk terug in het hok op</div>
            <div className="date">{fmtLong(done.date)}</div>
          </div>
        </div>
        <div className="done-body">
          <div style={{ font: "700 15px var(--head)", paddingBottom: 6 }}>Je hebt geleend</div>
          {done.lines.map((l) => <div className="li" key={l.name}><span style={{ fontWeight: 600 }}>{l.name}</span><b>{l.qty}×</b></div>)}
          <div style={{ display: "flex", gap: 10, marginTop: 18, fontSize: 14, lineHeight: 1.45, color: "#463d52" }}>
            <Mail size={20} color="#5b2a86" style={{ flex: "none", marginTop: 1 }} />
            <span>Bevestiging verstuurd naar <strong>{done.email}</strong>.</span>
          </div>
          <button className="btn-soft" style={{ marginTop: 18, alignSelf: "flex-start" }} onClick={addToCalendar}><Calendar size={20} />Zet in mijn agenda</button>
        </div>
        <div style={{ height: 24 }} />
        <Cta label="Klaar" onClick={finish} />
      </div>
    );

  return null;
}
