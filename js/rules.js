// De Bosboom — huisregels als gewone functies, zonder DOM en zonder backend.
// De app gebruikt ze in de browser; dezelfde functies kunnen op de server draaien
// (bv. in PocketBase pb_hooks via require), zodat iedereen precies hetzelfde rekent.
// Bedragen zijn altijd hele centen (int). Tijden zijn Date-objecten of ISO-strings.
const rules = (() => {
  const t = (x) => (x instanceof Date ? x.getTime() : new Date(x).getTime());

  // [a1,a2) en [b1,b2) overlappen? Een eindtijd is "tot", dus 19:00–21:00 en 21:00–23:00 botsen niet.
  const overlaps = (a1, a2, b1, b2) => t(a1) < t(b2) && t(b1) < t(a2);

  // ---------- geld ----------
  // "12,50", "12.5", "€ 12" -> 1250. Ongeldig of <= 0 -> null.
  function parseEuro(s) {
    const m = String(s == null ? "" : s).replace(/[€\s]/g, "").replace(",", ".").match(/^(\d{1,6})(?:\.(\d{0,2}))?$/);
    if (!m) return null;
    const c = Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0"));
    return c > 0 ? c : null;
  }
  function euro(cents, signed) {
    const n = Math.abs(cents), s = Math.floor(n / 100) + "," + String(n % 100).padStart(2, "0");
    return (cents < 0 ? "−" : signed && cents > 0 ? "+" : "") + "€ " + s;
  }

  // Verdeel een bedrag over aandelen ([{id, shares}]) in hele centen. Iedereen krijgt naar beneden
  // afgerond; de overgebleven centen gaan één voor één naar de grootste rest (bij gelijke rest: de
  // volgorde van de lijst). Zo telt het altijd precies op en rekent elk apparaat hetzelfde.
  function splitCents(amount, parts) {
    const total = parts.reduce((s, p) => s + p.shares, 0);
    if (!total) return {};
    const rows = parts.map((p, i) => ({ id: p.id, i, base: Math.floor((amount * p.shares) / total), rest: (amount * p.shares) % total }));
    let left = amount - rows.reduce((s, r) => s + r.base, 0);
    [...rows].sort((a, b) => b.rest - a.rest || a.i - b.i).forEach((r) => { if (left > 0) { r.base++; left--; } });
    const out = {};
    rows.forEach((r) => { out[r.id] = (out[r.id] || 0) + r.base; });
    return out;
  }

  // Saldo per persoon: + = krijgt geld terug, − = moet betalen.
  // expenses: [{amount_cents, kind: 'betaald'|'ontvangen', payer, shares: [{resident_id, shares}]}]
  function balances(expenses, ids) {
    const bal = {};
    (ids || []).forEach((id) => (bal[id] = 0));
    for (const e of expenses) {
      if (!e.shares || !e.shares.length) continue;
      const sign = e.kind === "ontvangen" ? -1 : 1;
      bal[e.payer] = (bal[e.payer] || 0) + sign * e.amount_cents;
      const parts = splitCents(e.amount_cents, e.shares.map((s) => ({ id: s.resident_id, shares: s.shares })));
      for (const id in parts) bal[id] = (bal[id] || 0) - sign * parts[id];
    }
    return bal;
  }

  // Zo min mogelijk overboekingen. Eerst wie precies tegen elkaar wegvallen, daarna steeds de
  // grootste schuldenaar naar de grootste ontvanger. Hooguit (aantal mensen − 1) overboekingen.
  function settle(bal) {
    const b = Object.keys(bal).sort().map((id) => ({ id, v: bal[id] })).filter((x) => x.v !== 0);
    const out = [];
    for (const d of b) {
      if (d.v >= 0) continue;
      const c = b.find((x) => x.v === -d.v);
      if (c) { out.push({ from_id: d.id, to_id: c.id, amount_cents: c.v }); c.v = 0; d.v = 0; }
    }
    for (;;) {
      let d = null, c = null;
      for (const x of b) {
        if (x.v < 0 && (!d || x.v < d.v)) d = x;
        if (x.v > 0 && (!c || x.v > c.v)) c = x;
      }
      if (!d || !c) break;
      const amt = Math.min(-d.v, c.v);
      out.push({ from_id: d.id, to_id: c.id, amount_cents: amt });
      d.v += amt; c.v -= amt;
    }
    return out;
  }

  // ---------- dibs ----------
  const MAX_DIB_MS = 24 * 3600e3;
  // Kan deze claim? Geeft null (ok) of {code, claim} terug.
  function checkDib(claims, c) {
    if (!(t(c.starts_at) < t(c.ends_at))) return { code: "tijd_ongeldig" };
    if (t(c.ends_at) - t(c.starts_at) > MAX_DIB_MS) return { code: "te_lang" };
    const hit = claims.find((x) => x.id !== c.id && x.item_id === c.item_id && overlaps(x.starts_at, x.ends_at, c.starts_at, c.ends_at));
    return hit ? { code: "dib_bezet", claim: hit } : null;
  }
  const dibNow = (claims, itemId, now) => claims.find((x) => x.item_id === itemId && t(x.starts_at) <= t(now) && t(now) < t(x.ends_at)) || null;

  // ---------- agenda ----------
  // Kring = je claimt het huis: niets anders mag ernaast, en niemand kan zich aanmelden.
  // Huisavond / activiteit = open: iedereen kan erbij, en ze mogen naast elkaar bestaan.
  const KINDS = ["kring", "huisavond", "activiteit"];
  function checkEvent(events, ev) {
    if (!KINDS.includes(ev.kind)) return { code: "soort_ongeldig" };
    if (!(t(ev.starts_at) < t(ev.ends_at))) return { code: "tijd_ongeldig" };
    if (t(ev.ends_at) - t(ev.starts_at) > 3 * 24 * 3600e3) return { code: "te_lang" };
    const hit = events.find((x) => x.id !== ev.id && (x.kind === "kring" || ev.kind === "kring") && overlaps(x.starts_at, x.ends_at, ev.starts_at, ev.ends_at));
    return hit ? { code: "huis_geclaimd", event: hit } : null;
  }
  const canJoin = (ev) => ev.kind !== "kring";

  // ---------- streeplijst ----------
  // Open strepen per bewoner -> {id: cents} (voor afrekenen via DeeldeDuit)
  function turfTotals(marks) {
    const out = {};
    for (const m of marks) out[m.resident_id] = (out[m.resident_id] || 0) + m.price_cents;
    return out;
  }

  return { overlaps, parseEuro, euro, splitCents, balances, settle, checkDib, dibNow, KINDS, checkEvent, canJoin, turfTotals };
})();
if (typeof module !== "undefined") module.exports = rules;
