// Test van de PocketBase-backend: start een echte PocketBase met pb_migrations/ en pb_hooks/,
// en praat ermee via de echte js/db.js (zoals de app dat doet).
// Draaien:  PB_BIN=/pad/naar/pocketbase node tests/pb.test.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";

const ROOT = new URL("..", import.meta.url).pathname;
const BIN = process.env.PB_BIN || "pocketbase";
const PORT = 8000 + Math.floor(Math.random() * 900);
const URL_ = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bosboom-pb-"));

const pbProc = spawn(BIN, ["serve", `--http=127.0.0.1:${PORT}`, `--dir=${dir}`,
  `--migrationsDir=${ROOT}pb_migrations`, `--hooksDir=${ROOT}pb_hooks`, `--publicDir=${ROOT}`], { stdio: ["ignore", "pipe", "pipe"] });
let log = "";
pbProc.stdout.on("data", (d) => (log += d));
pbProc.stderr.on("data", (d) => (log += d));
const stop = () => { try { pbProc.kill(); } catch (_) {} fs.rmSync(dir, { recursive: true, force: true }); };
process.on("exit", stop);

for (let i = 0; ; i++) {
  try { if ((await fetch(URL_ + "/api/health")).ok) break; } catch (_) {}
  if (i > 100) { console.log(log); throw new Error("PocketBase start niet"); }
  await new Promise((r) => setTimeout(r, 100));
}

// Een "browser" met de echte db.js. Elke client heeft zijn eigen login.
function client() {
  const store = {};
  const ctx = {
    console, fetch, URLSearchParams, FormData, Blob, AbortController, setTimeout, clearTimeout, Date, JSON,
    location: { origin: URL_, pathname: "/", hash: "", replace() {} },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(ROOT + "js/vendor/pocketbase-0.28.2.umd.js", "utf8"), ctx);
  vm.runInContext(fs.readFileSync(ROOT + "js/db.js", "utf8") + "\n;globalThis.db = db;", ctx);
  return ctx.db;
}
const code = async (p) => { try { await p; return "ok"; } catch (e) { if (process.env.DEBUG) console.log("  ->", e.code, e.message); return e.code || "ERR " + e.message; } };

let n = 0;
const ok = (label, actual, expected) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) console.log("✗", label, "kreeg", JSON.stringify(actual)); assert.deepStrictEqual(actual === undefined ? actual : JSON.parse(JSON.stringify(actual)), expected, label); n++; console.log("✓", label); };

try {
  // ---------- login + boom claimen ----------
  const iep = client(), berk = client(), anon = client();
  ok("niet ingelogd: geen data", await code(anon.list("residents")), "ok");   // lege lijst, geen rijen zichtbaar
  ok("niet ingelogd ziet niets", (await anon.list("residents")).length, 0);
  ok("wachtwoord te kort", await code(iep.auth.signUp("iep@bosboom.nl", "123")), "login");
  const u1 = await iep.auth.signUp("iep@bosboom.nl", "geheim123");
  ok("account + ingelogd", typeof u1.id, "string");
  ok("dubbel account", await code(berk.auth.signUp("iep@bosboom.nl", "geheim123")), "login");
  const u2 = await berk.auth.signUp("berk@bosboom.nl", "geheim123");
  ok("verkeerd wachtwoord", await code(anon.auth.signIn("iep@bosboom.nl", "fout")), "login");
  ok("user()", (await iep.auth.user()).id, u1.id);
  await iep.upsert("profiles", { id: u1.id, resident_id: "iep" }, ["id"]);
  ok("boom al geclaimd", await code(berk.upsert("profiles", { id: u2.id, resident_id: "iep" }, ["id"])), "bestaat_al");
  ok("andermans profiel", await code(berk.upsert("profiles", { id: u1.id, resident_id: "eik" }, ["id"])), "niet_gevonden");   // PocketBase: niet jouw rij = niet gevonden
  await berk.upsert("profiles", { id: u2.id, resident_id: "berk" }, ["id"]);
  ok("profielen", (await iep.list("profiles", { order: "resident_id" })).map((p) => p.resident_id), ["berk", "iep"]);

  // ---------- basis ----------
  ok("bewoners", (await iep.list("residents", { order: "sort" })).map((r) => [r.id, r.is_home]), [["iep", true], ["berk", false], ["eik", true]]);
  await iep.update("residents", { id: "berk" }, { is_home: true, away_label: "" });
  ok("thuis/weg", (await berk.list("residents", { where: { id: "berk" } }))[0].is_home, true);
  await iep.upsert("meals", { day: "2026-11-05", resident_id: "iep", status: "kookt", guests: 1 }, ["day", "resident_id"]);
  await iep.upsert("meals", { day: "2026-11-05", resident_id: "iep", status: "eet", guests: 2 }, ["day", "resident_id"]);
  const meals = await berk.list("meals", { where: { day: { gte: "2026-11-01", lte: "2026-11-30" } } });
  ok("eten upsert", meals.map((m) => [m.status, m.guests]), [["eet", 2]]);
  ok("recept startdata", (await iep.list("recipes"))[0].ingredients.length, 5);
  const r = await iep.insert("recipes", { title: "Soep", time_min: null, ingredients: ["water"], steps: "" });
  ok("recept zonder tijd", r.time_min, null);
  // ---------- opmerkingen: altijd op je eigen naam ----------
  const nt = await iep.insert("day_notes", { day: "2026-11-05", author: "Berk", text: "Ik eet laat" });
  ok("opmerking op eigen naam", nt.author, "Iep");
  ok("opmerking bewerken", (await iep.update("day_notes", { id: nt.id }, { text: "Ik eet om 19:00", author: "Berk" }))[0].author, "Iep");
  ok("tekst bewerkt", (await berk.list("day_notes", { where: { id: nt.id } }))[0].text, "Ik eet om 19:00");
  ok("andermans opmerking bewerken", await code(berk.update("day_notes", { id: nt.id }, { text: "gehackt" })), "niet_jouw_opmerking");
  const zonder = client(); await zonder.auth.signUp("gast@bosboom.nl", "geheim123");
  ok("opmerking zonder boom", await code(zonder.insert("day_notes", { day: "2026-11-05", author: "Eik", text: "x" })), "geen_boom");
  const qt = await berk.insert("quotes", { text: "Hoi", author: "Eik" });
  ok("quote bewerken", (await iep.update("quotes", { id: qt.id }, { text: "Hallo", author: "Berk" }))[0].author, "Berk");
  const s = await iep.insert("shopping", { text: "Melk" });
  ok("boodschap created_at", /^\d{4}-\d\d-\d\dT/.test(s.created_at), true);
  await iep.update("shopping", { id: s.id }, { done: true });
  await iep.remove("shopping", { id: s.id });
  ok("boodschap weg", (await iep.list("shopping")).length, 0);
  ok("chore_log", (await iep.insert("chore_log", { chore_id: "wc", task: "WC", done_by: "eik", done_at: "2026-11-04" })).done_by, "eik");
  ok("chore_log niet wissen", await code(iep.remove("chore_log", { chore_id: "wc" })), "geen_toegang");

  // ---------- agenda ----------
  const ev = (title, kind, a, b) => ({ title, kind, starts_at: new Date(a).toISOString(), ends_at: new Date(b).toISOString(), note: null });
  const kring = await iep.insert("events", ev("Kring van Iep", "kring", "2026-11-08T19:00+01:00", "2026-11-09T01:00+01:00"));
  ok("kring host = mijn boom", kring.host, "iep");
  ok("huisavond tijdens kring", await code(berk.insert("events", ev("x", "huisavond", "2026-11-08T20:00+01:00", "2026-11-08T22:00+01:00"))), "huis_geclaimd");
  const na = await berk.insert("events", ev("Na", "huisavond", "2026-11-09T01:00+01:00", "2026-11-09T03:00+01:00"));
  ok("huisavond direct na kring mag", na.host, "berk");
  ok("2e kring overlap", await code(berk.insert("events", ev("k2", "kring", "2026-11-08T23:00+01:00", "2026-11-09T00:30+01:00"))), "huis_geclaimd");
  ok("kring tijdens huisavond", await code(berk.insert("events", ev("k3", "kring", "2026-11-09T02:00+01:00", "2026-11-09T04:00+01:00"))), "huis_geclaimd");
  ok("tijd omgedraaid", await code(berk.insert("events", ev("t", "activiteit", "2026-11-10T04:00+01:00", "2026-11-10T02:00+01:00"))), "tijd_ongeldig");
  ok("rsvp op kring", await code(berk.upsert("event_rsvp", { event_id: kring.id, resident_id: "berk", status: "ja" }, ["event_id", "resident_id"])), "kring_niet_aansluiten");
  await iep.upsert("event_rsvp", { event_id: na.id, resident_id: "iep", status: "ja" }, ["event_id", "resident_id"]);
  await iep.upsert("event_rsvp", { event_id: na.id, resident_id: "iep", status: "misschien" }, ["event_id", "resident_id"]);
  ok("rsvp upsert", (await iep.list("event_rsvp", { where: { event_id: [na.id] } })).map((x) => x.status), ["misschien"]);
  ok("agenda lijst", (await iep.list("events", { where: { ends_at: { gt: "2026-11-01T00:00:00.000Z" } }, order: "starts_at" })).map((e) => e.title), ["Kring van Iep", "Na"]);
  await iep.remove("events", { id: na.id });
  ok("rsvp mee weg", (await iep.list("event_rsvp")).length, 0);

  // ---------- dibs ----------
  const [wm, droger] = await iep.list("dib_items", { order: ["sort", "created_at"] });
  const dib = (item, a, b) => ({ item_id: item.id, starts_at: new Date(a).toISOString(), ends_at: new Date(b).toISOString(), note: null });
  const d1 = await iep.insert("dib_claims", dib(wm, "2026-11-08T10:00+01:00", "2026-11-08T12:00+01:00"));
  ok("dib resident = mijn boom", [d1.resident_id, d1.note], ["iep", null]);
  ok("dib overlap", await code(berk.insert("dib_claims", dib(wm, "2026-11-08T11:00+01:00", "2026-11-08T13:00+01:00"))), "dib_bezet");
  ok("dib aansluitend", await code(berk.insert("dib_claims", dib(wm, "2026-11-08T12:00+01:00", "2026-11-08T13:00+01:00"))), "ok");
  ok("dib droger zelfde tijd", await code(berk.insert("dib_claims", dib(droger, "2026-11-08T11:00+01:00", "2026-11-08T13:00+01:00"))), "ok");
  ok("dib te lang", await code(berk.insert("dib_claims", dib(droger, "2026-11-10T11:00+01:00", "2026-11-11T13:00+01:00"))), "te_lang");
  ok("dib verlengen botst", await code(iep.update("dib_claims", { id: d1.id }, { ends_at: "2026-11-08T12:30:00+01:00" })), "dib_bezet");
  ok("dib inkorten mag", (await iep.update("dib_claims", { id: d1.id }, { ends_at: "2026-11-08T11:00:00+01:00" }))[0].ends_at, "2026-11-08T10:00:00.000Z");

  // ---------- deeldeduit ----------
  const all3 = [{ resident_id: "iep", shares: 1 }, { resident_id: "berk", shares: 1 }, { resident_id: "eik", shares: 1 }];
  const e1 = await iep.call("save_expense", { p_id: null, p_description: "AH", p_amount_cents: 1000, p_kind: "betaald", p_payer: "iep", p_spent_on: "2026-11-03", p_shares: all3 });
  await iep.call("save_expense", { p_id: null, p_description: "Pizza", p_amount_cents: 2400, p_kind: "betaald", p_payer: "eik", p_spent_on: "2026-11-03", p_shares: [{ resident_id: "eik", shares: 2 }, { resident_id: "iep", shares: 1 }] });
  ok("geen deelnemers", await code(iep.call("save_expense", { p_id: null, p_description: "x", p_amount_cents: 5, p_kind: "betaald", p_payer: "iep", p_shares: [] })), "geen_deelnemers");
  await iep.call("save_expense", { p_id: e1, p_description: "AH bonus", p_amount_cents: 1000, p_kind: "betaald", p_payer: "iep", p_spent_on: "2026-11-03", p_shares: all3 });
  const open = await iep.list("expenses", { where: { settlement_id: null }, order: ["spent_on", "created_at"], desc: true });
  ok("open uitgaven", open.map((e) => [e.description, e.settlement_id]), [["Pizza", null], ["AH bonus", null]]);
  ok("aandelen", (await iep.list("expense_shares", { where: { expense_id: open.map((e) => e.id) } })).length, 5);
  ok("uitgave met settlement_id maken mag niet", await code(iep.insert("expenses", { description: "x", amount_cents: 5, payer: "iep", settlement_id: "abc" })), "geen_toegang");

  // kookkosten (04): één uitgave per kookdag per kok
  const k1 = await iep.call("save_expense", { p_id: null, p_description: "Eten di", p_amount_cents: 1500, p_kind: "betaald", p_payer: "berk", p_spent_on: "2026-11-03", p_shares: all3, p_meal_day: "2026-11-03" });
  ok("2e kookuitgave zelfde dag", await code(iep.call("save_expense", { p_id: null, p_description: "x", p_amount_cents: 5, p_kind: "betaald", p_payer: "berk", p_shares: all3, p_meal_day: "2026-11-03" })), "bestaat_al");
  await iep.call("save_expense", { p_id: k1, p_description: "Eten di", p_amount_cents: 1600, p_kind: "betaald", p_payer: "berk", p_spent_on: "2026-11-03", p_shares: all3 });
  ok("meal_day blijft bij bewerken", (await iep.list("expenses", { where: { meal_day: { gte: "2026-11-01" } } })).map((e) => [e.meal_day, e.amount_cents]), [["2026-11-03", 1600]]);
  ok("gewone uitgave: meal_day null", (await iep.list("expenses", { where: { id: e1 } }))[0].meal_day, null);
  await iep.remove("expenses", { id: k1 });

  // ---------- streeplijst ----------
  const [bier, fris] = await iep.list("turf_items", { order: ["sort", "created_at"] });
  ok("streep item standaard actief", [bier.active, bier.stock], [true, null]);
  await iep.update("turf_items", { id: bier.id }, { stock: 5 });
  const m1 = await berk.insert("turf_marks", { item_id: bier.id, resident_id: "berk", price_cents: 1 });
  ok("prijs gaat vast mee", m1.price_cents, 80);
  await berk.insert("turf_marks", { item_id: fris.id, resident_id: "eik" });
  const m3 = await berk.insert("turf_marks", { item_id: bier.id, resident_id: "berk" });
  ok("voorraad omlaag", (await iep.list("turf_items", { where: { id: bier.id } }))[0].stock, 3);
  await berk.remove("turf_marks", { id: m3.id });
  ok("voorraad terug", (await iep.list("turf_items", { where: { id: bier.id } }))[0].stock, 4);
  ok("streep aanpassen verboden", await code(berk.update("turf_marks", { id: m1.id }, { price_cents: 0 })), "geen_toegang");
  const big = await iep.insert("turf_items", { name: "Wijn", icon: "", price_cents: 300, stock: null, active: false, sort: 2 });
  ok("inactief item", await code(berk.insert("turf_marks", { item_id: big.id, resident_id: "berk" })), "item_niet_actief");
  ok("turf afrekenen", typeof (await iep.call("turf_afrekenen", { p_payer: "iep" })), "string");
  ok("niets meer open", await code(iep.call("turf_afrekenen", { p_payer: "iep" })), "niets_af_te_rekenen");
  ok("streep na afrekenen niet weg", await code(berk.remove("turf_marks", { id: m1.id })), "ok");   // stil genegeerd: regel laat het niet zien
  ok("streep bestaat nog", (await berk.list("turf_marks", { where: { id: m1.id } })).length, 1);
  const turfExp = await iep.list("expenses", { where: { settlement_id: null, description: "Streeplijst" }, order: "amount_cents" });
  ok("turf -> uitgaven", turfExp.map((e) => [e.payer, e.amount_cents]), [["iep", 60], ["iep", 80]]);

  // ---------- afrekenen ----------
  const sid = await iep.call("settle_expenses", {});
  const tr = await iep.list("settlement_transfers", { where: { settlement_id: [sid] }, order: "amount_cents" });
  // AH bonus 1000/3 -> iep 334, berk 333, eik 333; Pizza 2400 (eik 2, iep 1) -> eik 1600, iep 800;
  // turf: berk 80 en eik 60 aan iep.  Iep: +1000-334-800+140 = 6; Berk: -333-80 = -413; Eik: +2400-333-1600-60 = 407
  ok("overboekingen", tr.map((t) => [t.from_id, t.to_id, t.amount_cents, t.paid_at]), [["berk", "iep", 6, null], ["berk", "eik", 407, null]]);
  ok("afgerekend: wijzigen kan niet", await code(iep.update("expenses", { id: e1 }, { amount_cents: 1 })), "niet_gevonden");   // regel: alleen open uitgaven
  ok("afgerekend: ongewijzigd", (await iep.list("expenses", { where: { id: e1 } }))[0].amount_cents, 1000);
  ok("afgerekend: bewerken via call", await code(iep.call("save_expense", { p_id: e1, p_description: "x", p_amount_cents: 5, p_kind: "betaald", p_payer: "iep", p_shares: all3 })), "al_afgerekend");
  ok("overboeking zelf maken", await code(iep.insert("settlement_transfers", { settlement_id: sid, from_id: "iep", to_id: "berk", amount_cents: 5 })), "geen_toegang");
  await berk.call("mark_transfer_paid", { p_transfer: tr[0].id, p_paid: true });
  ok("betaald", (await iep.list("settlement_transfers", { where: { id: tr[0].id } }))[0].paid_by, u2.id);
  ok("terugdraaien na betalen", await code(iep.call("undo_settlement", { p_settlement: sid })), "al_betaald");
  await berk.call("mark_transfer_paid", { p_transfer: tr[0].id, p_paid: false });
  await iep.call("undo_settlement", { p_settlement: sid });
  ok("terugdraaien", (await iep.list("expenses", { where: { settlement_id: null } })).length, 4);
  ok("overboekingen weg", (await iep.list("settlement_transfers")).length, 0);
  ok("onbekende functie", await code(iep.call("bestaat_niet", {})), "niet_gevonden");
  ok("functie zonder login", await code(anon.call("settle_expenses", {})), "geen_toegang");

  // ---------- statistieken-filters ----------
  ok("stats turf_marks", (await iep.list("turf_marks", { where: { created_at: { gte: "2026-01-01T00:00:00.000Z" } } })).length, 2);
  ok("stats expenses", (await iep.list("expenses", { where: { spent_on: { gte: "2026-11-01" }, kind: "betaald" } })).length, 4);
  ok("limit + desc", (await iep.list("quotes", { order: "created_at", desc: true, limit: 1 })).length, 1);

  // ---------- de app zelf wordt geserveerd ----------
  ok("index.html", (await fetch(URL_ + "/")).status, 200);

  console.log(`\n${n} tests geslaagd`);
} catch (e) {
  console.error(e);
  console.log("---- PocketBase log ----\n" + log.slice(-4000));
  process.exitCode = 1;
} finally {
  stop();
}
