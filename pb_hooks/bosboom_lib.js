// De Bosboom — huisregels op de server (PocketBase). Wordt geladen door bosboom.pb.js.
// Dit is de PocketBase-versie van de functies en triggers in sql/03_huispot_features.sql.
// De rekenregels zelf komen uit js/rules.js, dus de app en de server rekenen precies hetzelfde.
//
// Foutcodes (dib_bezet, huis_geclaimd, ...) gaan als foutmelding terug naar de app; js/db.js
// herkent ze en de schermen tonen dezelfde meldingen als voorheen.

const rules = require(`${__hooks}/../js/rules.js`);

function fail(code) { throw new BadRequestError(code); }

const pad = (n) => String(n).padStart(2, "0");
const nowIso = () => new Date().toISOString();
// Vandaag in de tijdzone van de Pi (zet die op Europe/Amsterdam)
const today = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

const has = (rec, field) => !!rec.collection().fields.getByName(field);
const str = (rec, field) => rec.getString(field);
const jsonVal = (rec, field) => { const s = rec.getString(field); return s === "" ? null : JSON.parse(s); };

// Tijden altijd als "2026-11-08T18:00:00.000Z" opslaan, zodat vergelijken en sorteren als tekst klopt.
function normTimes(rec, fields) {
  fields.forEach((f) => {
    const v = rec.getString(f);
    if (!v) return;
    const d = new Date(v);
    if (isNaN(d.getTime())) fail("tijd_ongeldig");
    rec.set(f, d.toISOString());
  });
}

function myResident(app, authId) {
  if (!authId) return "";
  try { return app.findRecordById("profiles", authId).getString("resident_id"); } catch (_) { return ""; }
}

// Naam van de ingelogde bewoner ("Iep"), voor opmerkingen. Leeg als je (nog) geen boom hebt.
function myName(app, authId) {
  const rid = myResident(app, authId);
  if (!rid) return "";
  try { return app.findRecordById("residents", rid).getString("name"); } catch (_) { return ""; }
}
// Een gewone gebruiker (geen beheerder in het PocketBase-dashboard)?
const isUser = (e) => !!(e.auth && e.auth.collection().name === "users");

const plain = (rec, fields) => { const o = { id: rec.id }; fields.forEach((f) => (o[f] = rec.getString(f))); return o; };

function overlapping(app, collection, extraFilter, rec, params) {
  return app.findRecordsByFilter(collection,
    "id != {:id} && starts_at < {:end} && ends_at > {:start}" + (extraFilter ? " && " + extraFilter : ""),
    "starts_at", 50, 0,
    Object.assign({ id: rec.id || "", start: str(rec, "starts_at"), end: str(rec, "ends_at") }, params || {}));
}

// ---------------------------------------------------------------------------
// Standaardwaarden die de app niet meestuurt (zoals "default my_resident()" in de SQL).
// Alleen bij aanmaken via de API: e.auth is dan de ingelogde gebruiker.
// ---------------------------------------------------------------------------
function requestDefaults(e) {
  const rec = e.record, name = rec.collection().name;
  const body = e.requestInfo().body || {};
  const authId = e.auth ? e.auth.id : "";
  const blank = (f) => rec.getString(f) === "";
  if (has(rec, "created_by")) rec.set("created_by", authId);
  if (has(rec, "created_at")) rec.set("created_at", nowIso());
  switch (name) {
    case "dib_items": if (blank("icon")) rec.set("icon", "📦"); break;
    case "turf_items":
      if (blank("icon")) rec.set("icon", "🍺");
      if (!("active" in body)) rec.set("active", true);
      break;
    case "dib_claims": if (blank("resident_id")) rec.set("resident_id", myResident(e.app, authId)); break;
    case "events": if (blank("host")) rec.set("host", myResident(e.app, authId)); break;
    case "expenses":
      if (blank("kind")) rec.set("kind", "betaald");
      if (blank("spent_on")) rec.set("spent_on", today());
      break;
    case "chore_log": if (blank("done_at")) rec.set("done_at", today()); break;
    case "residents": if (!("is_home" in body)) rec.set("is_home", true); break;
    case "turf_marks": rec.set("settlement_id", ""); break;   // een nieuwe streep is altijd open
    case "day_notes":
      // Een opmerking staat altijd op de naam van wie hem plaatst, wat de app ook meestuurt.
      if (isUser(e)) {
        const me = myName(e.app, authId);
        if (!me) fail("geen_boom");
        rec.set("author", me);
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Bij bewerken via de API: je mag alleen je eigen opmerking aanpassen, en de naam blijft staan.
// ---------------------------------------------------------------------------
function requestUpdate(e) {
  const rec = e.record;
  if (rec.collection().name !== "day_notes" || !isUser(e)) return;
  const was = rec.original().getString("author");
  if (was !== myName(e.app, e.auth.id)) fail("niet_jouw_opmerking");
  rec.set("author", was);
}

// ---------------------------------------------------------------------------
// Controles vóór elke opslag (ook als de server zelf iets opslaat)
// ---------------------------------------------------------------------------
function beforeSave(app, rec, isNew) {
  const name = rec.collection().name;
  if (isNew && has(rec, "created_at") && rec.getString("created_at") === "") rec.set("created_at", nowIso());

  if (name === "dib_claims") {
    normTimes(rec, ["starts_at", "ends_at"]);
    const c = plain(rec, ["item_id", "starts_at", "ends_at"]);
    const hits = overlapping(app, "dib_claims", "item_id = {:item}", rec, { item: c.item_id })
      .map((x) => plain(x, ["item_id", "starts_at", "ends_at"]));
    const chk = rules.checkDib(hits, c);
    if (chk) fail(chk.code);
  }

  if (name === "events") {
    normTimes(rec, ["starts_at", "ends_at"]);
    const ev = plain(rec, ["kind", "starts_at", "ends_at"]);
    const hits = overlapping(app, "events", "", rec).map((x) => plain(x, ["kind", "starts_at", "ends_at"]));
    const chk = rules.checkEvent(hits, ev);
    if (chk) fail(chk.code);
  }

  if (name === "event_rsvp") {
    let ev;
    try { ev = app.findRecordById("events", rec.getString("event_id")); } catch (_) { fail("niet_gevonden"); }
    if (!rules.canJoin({ kind: ev.getString("kind") })) fail("kring_niet_aansluiten");
    rec.set("updated_at", nowIso());
  }

  if (name === "turf_marks" && isNew) {
    let item;
    try { item = app.findRecordById("turf_items", rec.getString("item_id")); } catch (_) { fail("item_niet_actief"); }
    if (!item.getBool("active")) fail("item_niet_actief");
    rec.set("price_cents", item.getInt("price_cents"));   // de prijs gaat vast mee
  }

  if (name === "settlement_transfers") normTimes(rec, ["paid_at"]);
}

function afterSave(app, rec, isNew) {
  const name = rec.collection().name;
  if (name === "turf_marks" && isNew) stockChange(app, rec.getString("item_id"), -1);
  // Een kring heeft geen aanmeldingen
  if (name === "events" && !isNew && rec.getString("kind") === "kring") {
    app.findRecordsByFilter("event_rsvp", "event_id = {:id}", "", 0, 0, { id: rec.id }).forEach((r) => app.delete(r));
  }
}

function afterDelete(app, rec) {
  // Open streep weggehaald: voorraad terug
  if (rec.collection().name === "turf_marks" && rec.getString("settlement_id") === "") stockChange(app, rec.getString("item_id"), +1);
}

function stockChange(app, itemId, delta) {
  let item;
  try { item = app.findRecordById("turf_items", itemId); } catch (_) { return; }
  const stock = jsonVal(item, "stock");
  if (stock === null || stock === undefined) return;   // voorraad wordt niet bijgehouden
  item.set("stock", Math.max(Number(stock) + delta, -999));
  app.save(item);
}

// ---------------------------------------------------------------------------
// Server-functies (db.call in de app). Elk draait in één transactie.
// ---------------------------------------------------------------------------
function create(app, collection, values) {
  const r = new Record(app.findCollectionByNameOrId(collection));
  for (const k in values) r.set(k, values[k]);
  app.save(r);
  return r;
}

function residentOrder(app) {
  const order = {};
  app.findRecordsByFilter("residents", "", "sort", 0, 0).forEach((r, i) => (order[r.id] = i));
  return order;
}

// Uitgaven (records) -> vorm die rules.balances verwacht, met aandelen op volgorde van de bewoners.
function expensesWithShares(app, list) {
  if (!list.length) return [];
  const order = residentOrder(app);
  const params = {}, parts = [];
  list.forEach((e, i) => { params["e" + i] = e.id; parts.push("expense_id = {:e" + i + "}"); });
  const shares = app.findRecordsByFilter("expense_shares", parts.join(" || "), "", 0, 0, params);
  return list.map((e) => ({
    amount_cents: e.getInt("amount_cents"), kind: e.getString("kind"), payer: e.getString("payer"),
    shares: shares.filter((s) => s.getString("expense_id") === e.id)
      .map((s) => ({ resident_id: s.getString("resident_id"), shares: s.getInt("shares") }))
      .sort((a, b) => (order[a.resident_id] || 0) - (order[b.resident_id] || 0)),
  }));
}

const CALLS = {
  // Uitgave opslaan (nieuw of bewerken) samen met wie meedoen, in één keer.
  save_expense(app, a, authId) {
    const shares = a.p_shares;
    if (!Array.isArray(shares) || !shares.length) fail("geen_deelnemers");
    // Per kookdag en kok hooguit één uitgave
    if (a.p_meal_day && app.findRecordsByFilter("expenses", "meal_day = {:d} && payer = {:p} && id != {:id}", "", 1, 0,
      { d: a.p_meal_day, p: a.p_payer || "", id: a.p_id || "" }).length) fail("bestaat_al");
    let e;
    const values = {
      description: String(a.p_description || "").trim(), amount_cents: a.p_amount_cents, kind: a.p_kind || "betaald",
      payer: a.p_payer,
    };
    if (!a.p_id) {
      e = create(app, "expenses", Object.assign(values, { spent_on: a.p_spent_on || today(), meal_day: a.p_meal_day || "", created_by: authId }));
    } else {
      try { e = app.findRecordById("expenses", a.p_id); } catch (_) { fail("al_afgerekend"); }
      if (e.getString("settlement_id") !== "" || e.getString("turf_settlement_id") !== "") fail("al_afgerekend");
      for (const k in values) e.set(k, values[k]);
      if (a.p_spent_on) e.set("spent_on", a.p_spent_on);
      if (a.p_meal_day) e.set("meal_day", a.p_meal_day);   // niet meegegeven: houden wat er stond
      app.save(e);
      app.findRecordsByFilter("expense_shares", "expense_id = {:id}", "", 0, 0, { id: e.id }).forEach((s) => app.delete(s));
    }
    shares.forEach((s) => create(app, "expense_shares", { expense_id: e.id, resident_id: s.resident_id, shares: s.shares == null ? 1 : s.shares }));
    return e.id;
  },

  // Afrekenen: alle open uitgaven in één afrekening, met zo min mogelijk overboekingen.
  settle_expenses(app, a, authId) {
    const open = app.findRecordsByFilter("expenses", "settlement_id = ''", "", 0, 0);
    if (!open.length) fail("niets_af_te_rekenen");
    const s = create(app, "settlements", { created_by: authId });
    open.forEach((e) => { e.set("settlement_id", s.id); app.save(e); });
    const ids = app.findRecordsByFilter("residents", "", "sort", 0, 0).map((r) => r.id);
    const bal = rules.balances(expensesWithShares(app, open), ids);
    rules.settle(bal).forEach((t) => create(app, "settlement_transfers", Object.assign({ settlement_id: s.id }, t)));
    return s.id;
  },

  mark_transfer_paid(app, a, authId) {
    let t;
    try { t = app.findRecordById("settlement_transfers", a.p_transfer); } catch (_) { fail("niet_gevonden"); }
    t.set("paid_at", a.p_paid ? nowIso() : "");
    t.set("paid_by", a.p_paid ? authId : "");
    app.save(t);
    return null;
  },

  // Per ongeluk afgerekend? Terugdraaien kan zolang er nog niets betaald is.
  undo_settlement(app, a) {
    let s;
    try { s = app.findRecordById("settlements", a.p_settlement); } catch (_) { return null; }
    if (app.findRecordsByFilter("settlement_transfers", "settlement_id = {:s} && paid_at != ''", "", 1, 0, { s: s.id }).length) fail("al_betaald");
    app.findRecordsByFilter("expenses", "settlement_id = {:s}", "", 0, 0, { s: s.id }).forEach((e) => { e.set("settlement_id", ""); app.save(e); });
    app.delete(s);
    return null;
  },

  // Open strepen afrekenen: p_payer kocht de drank. Iedere andere boom krijgt één uitgave voor zijn
  // eigen strepen (p_payer betaalde, alleen die boom doet mee). Zo staat het exact in DeeldeDuit.
  turf_afrekenen(app, a, authId) {
    try { app.findRecordById("residents", a.p_payer || "-"); } catch (_) { fail("niet_gevonden"); }
    const marks = app.findRecordsByFilter("turf_marks", "settlement_id = ''", "created_at", 0, 0);
    if (!marks.length) fail("niets_af_te_rekenen");
    const totals = rules.turfTotals(marks.map((m) => ({ resident_id: m.getString("resident_id"), price_cents: m.getInt("price_cents") })));
    const t = create(app, "turf_settlements", { payer: a.p_payer, total_cents: 0, created_by: authId });
    let total = 0;
    for (const who in totals) {
      total += totals[who];
      if (who === a.p_payer || totals[who] === 0) continue;
      const e = create(app, "expenses", { description: "Streeplijst", amount_cents: totals[who], kind: "betaald", payer: a.p_payer,
        spent_on: today(), turf_settlement_id: t.id, created_by: authId });
      create(app, "expense_shares", { expense_id: e.id, resident_id: who, shares: 1 });
    }
    marks.forEach((m) => { m.set("settlement_id", t.id); app.save(m); });
    t.set("total_cents", total);
    app.save(t);
    return t.id;
  },
};

function call(e) {
  const name = e.request.pathValue("name");
  const fn = CALLS[name];
  if (!fn) throw new NotFoundError("niet_gevonden");
  const args = e.requestInfo().body || {};
  const authId = e.auth ? e.auth.id : "";
  let out = null;
  e.app.runInTransaction((tx) => { out = fn(tx, args, authId); });
  return out;
}

module.exports = { requestDefaults, requestUpdate, beforeSave, afterSave, afterDelete, call };
