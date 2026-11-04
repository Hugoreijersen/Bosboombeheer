/// <reference path="../pb_data/types.d.ts" />
// De Bosboom — alle tabellen voor PocketBase (zelfde namen en kolommen als de Supabase-SQL in sql/).
// PocketBase draait dit één keer bij de eerste start (en houdt bij dat het gedraaid is).
//
// Keuzes:
//  - Tijden staan als tekst in ISO-formaat ("2026-11-08T19:00:00.000Z"), datums als "2026-11-08".
//    Zo sorteren en vergelijken ze goed, precies zoals de app ze verstuurt.
//  - "Leeg" (null) is in PocketBase een lege string; js/db.js zet dat terug naar null.
//  - Getallen die leeg mogen zijn (voorraad, bereidingstijd) zijn een json-veld, zodat null kan.
//  - De huisregels (overlap, afrekenen, ...) staan in pb_hooks/.
migrate((app) => {
  const AUTH = "@request.auth.id != '' && @request.auth.collectionName = 'users'";
  const OPEN = { listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH };
  const READ_ONLY = { listRule: AUTH, viewRule: AUTH, createRule: null, updateRule: null, deleteRule: null };
  const DATE = "^$|^\\d{4}-\\d{2}-\\d{2}$";

  const text = (name, o) => Object.assign({ name, type: "text" }, o || {});
  const num = (name, o) => Object.assign({ name, type: "number", onlyInt: true }, o || {});
  const bool = (name) => ({ name, type: "bool" });
  const json = (name) => ({ name, type: "json", maxSize: 20000 });
  const day = (name, required) => text(name, { pattern: DATE, required: !!required });
  const ts = (name, required) => text(name, { max: 40, required: !!required });
  const sel = (name, values, required) => ({ name, type: "select", maxSelect: 1, values, required: required !== false });
  const rel = (name, target, o) => Object.assign({
    name, type: "relation", maxSelect: 1,
    collectionId: app.findCollectionByNameOrId(target).id, cascadeDelete: false,
  }, o || {});
  // Eigen id's als 'iep' of 'wc' (in plaats van de standaard 15 tekens)
  const shortId = { name: "id", type: "text", primaryKey: true, required: true, system: true,
    min: 1, max: 30, pattern: "^[a-z0-9_-]+$", autogeneratePattern: "[a-z0-9]{15}" };

  function make(name, fields, rules, indexes) {
    const c = new Collection(Object.assign({ type: "base", name, fields, indexes: indexes || [] }, rules || OPEN));
    app.save(c);
    return c;
  }

  // ---------- basis (01_schema.sql) ----------
  make("residents", [shortId, text("name", { required: true }), text("tree"), text("color"), num("sort"),
    bool("is_home"), text("away_label")], { listRule: AUTH, viewRule: AUTH, createRule: null, updateRule: AUTH, deleteRule: null });
  make("meals", [day("day", true), rel("resident_id", "residents", { required: true, cascadeDelete: true }),
    text("status"), num("guests", { min: 0, max: 50 })], OPEN,
    ["CREATE UNIQUE INDEX idx_meals_day_res ON meals (day, resident_id)"]);
  make("day_notes", [day("day", true), text("author", { required: true }), text("text", { required: true, max: 500 }), ts("created_at")]);
  make("chores", [shortId, text("task", { required: true }), text("ritme"), text("who"), day("last_done"), num("sort")],
    { listRule: AUTH, viewRule: AUTH, createRule: null, updateRule: AUTH, deleteRule: null });
  make("shopping", [text("text", { required: true, max: 200 }), bool("done"), ts("created_at")]);
  make("recipes", [text("title", { required: true, max: 120 }), json("time_min"), json("ingredients"),
    text("steps", { max: 10000 }), ts("created_at")]);
  make("quotes", [text("text", { required: true, max: 500 }), text("author"), ts("created_at")]);
  make("plans", [day("day", true), rel("resident_id", "residents", { required: true, cascadeDelete: true }), text("text")], OPEN,
    ["CREATE UNIQUE INDEX idx_plans_day_res ON plans (day, resident_id)"]);

  // ---------- login -> boom (02_auth_and_policies.sql) ----------
  make("profiles", [
    { name: "id", type: "text", primaryKey: true, required: true, system: true, min: 1, max: 30, pattern: "^[a-z0-9]+$", autogeneratePattern: "[a-z0-9]{15}" },
    rel("resident_id", "residents"), ts("created_at"),
  ], {
    listRule: AUTH, viewRule: AUTH,
    createRule: AUTH + " && @request.body.id = @request.auth.id",
    updateRule: AUTH + " && id = @request.auth.id", deleteRule: null,
  }, ["CREATE UNIQUE INDEX idx_profiles_res ON profiles (resident_id) WHERE resident_id != ''"]);

  // ---------- Huispot (03_huispot_features.sql) ----------
  make("chore_log", [rel("chore_id", "chores"), text("task", { required: true }), rel("done_by", "residents", { required: true }),
    day("done_at"), ts("created_at")],
    { listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: null, deleteRule: null },
    ["CREATE INDEX idx_chore_log_done ON chore_log (done_at)"]);

  make("dib_items", [text("name", { required: true, min: 1, max: 30 }), text("icon", { max: 8 }), num("sort"), ts("created_at")]);
  make("dib_claims", [rel("item_id", "dib_items", { required: true, cascadeDelete: true }), rel("resident_id", "residents", { required: true }),
    ts("starts_at", true), ts("ends_at", true), text("note", { max: 60 }), text("created_by"), ts("created_at")], OPEN,
    ["CREATE INDEX idx_dib_claims_ends ON dib_claims (ends_at)", "CREATE INDEX idx_dib_claims_item ON dib_claims (item_id, starts_at)"]);

  make("events", [text("title", { required: true, min: 1, max: 60 }), sel("kind", ["kring", "huisavond", "activiteit"]),
    rel("host", "residents", { required: true }), ts("starts_at", true), ts("ends_at", true), text("note", { max: 300 }),
    text("created_by"), ts("created_at")], OPEN,
    ["CREATE INDEX idx_events_ends ON events (ends_at)"]);
  make("event_rsvp", [rel("event_id", "events", { required: true, cascadeDelete: true }), rel("resident_id", "residents", { required: true }),
    sel("status", ["ja", "misschien", "nee"]), ts("updated_at")], OPEN,
    ["CREATE UNIQUE INDEX idx_rsvp_event_res ON event_rsvp (event_id, resident_id)"]);

  make("settlements", [text("created_by"), ts("created_at")], READ_ONLY);
  make("turf_settlements", [rel("payer", "residents", { required: true }), num("total_cents", { min: 0 }), text("created_by"), ts("created_at")], READ_ONLY);
  // Afgerekende uitgaven zijn alleen-lezen: wijzigen en weggooien mag alleen als settlement_id leeg is.
  make("expenses", [text("description", { required: true, min: 1, max: 80 }), num("amount_cents", { required: true, min: 1, max: 1000000 }),
    sel("kind", ["betaald", "ontvangen"]), rel("payer", "residents", { required: true }), day("spent_on"),
    rel("settlement_id", "settlements"), rel("turf_settlement_id", "turf_settlements", { cascadeDelete: true }),
    day("meal_day"),   // boodschappen van wie kookte (04_eten_kosten.sql): hooguit één per dag per kok
    text("created_by"), ts("created_at")], {
    listRule: AUTH, viewRule: AUTH,
    createRule: AUTH + " && @request.body.settlement_id:isset = false && @request.body.turf_settlement_id:isset = false",
    updateRule: AUTH + " && settlement_id = '' && @request.body.settlement_id:isset = false && @request.body.turf_settlement_id:isset = false",
    deleteRule: AUTH + " && settlement_id = ''",
  }, ["CREATE INDEX idx_expenses_open ON expenses (settlement_id)", "CREATE INDEX idx_expenses_meal_day ON expenses (meal_day)",
    "CREATE UNIQUE INDEX idx_expenses_meal_once ON expenses (meal_day, payer) WHERE meal_day != ''"]);
  const shareRule = AUTH + " && expense_id.settlement_id = ''";
  make("expense_shares", [rel("expense_id", "expenses", { required: true, cascadeDelete: true }), rel("resident_id", "residents", { required: true }),
    num("shares", { required: true, min: 1, max: 20 })],
    { listRule: AUTH, viewRule: AUTH, createRule: shareRule, updateRule: shareRule, deleteRule: shareRule },
    ["CREATE UNIQUE INDEX idx_shares_exp_res ON expense_shares (expense_id, resident_id)"]);
  make("settlement_transfers", [rel("settlement_id", "settlements", { required: true, cascadeDelete: true }),
    rel("from_id", "residents", { required: true }), rel("to_id", "residents", { required: true }),
    num("amount_cents", { required: true, min: 1 }), ts("paid_at"), text("paid_by")], READ_ONLY);

  make("turf_items", [text("name", { required: true, min: 1, max: 30 }), text("icon", { max: 8 }), num("price_cents", { min: 0, max: 10000 }),
    json("stock"), bool("active"), num("sort"), ts("created_at")]);
  // Strepen: zetten en weghalen zolang ze open zijn; aanpassen niet (de prijs ligt vast).
  make("turf_marks", [rel("item_id", "turf_items", { required: true }), rel("resident_id", "residents", { required: true }),
    num("price_cents", { min: 0 }), rel("settlement_id", "turf_settlements"), text("created_by"), ts("created_at")], {
    listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: null, deleteRule: AUTH + " && settlement_id = ''",
  }, ["CREATE INDEX idx_turf_marks_open ON turf_marks (settlement_id)", "CREATE INDEX idx_turf_marks_created ON turf_marks (created_at)"]);

  // ---------- accounts ----------
  const users = app.findCollectionByNameOrId("users");
  users.fields.getByName("password").min = 6;               // de app zegt "minstens 6 tekens"
  users.resetPasswordTemplate.actionURL = "{APP_URL}/#reset={TOKEN}";   // resetlink komt terug in de app zelf
  app.save(users);

  // Elke nacht om 03:00 een back-up in pb_data/backups, de laatste 7 bewaren.
  const settings = app.settings();
  settings.meta.appName = "De Bosboom";
  settings.backups.cron = "0 3 * * *";
  settings.backups.cronMaxKeep = 7;
  app.save(settings);

  // ---------- startdata ----------
  function seed(name, rows) {
    const c = app.findCollectionByNameOrId(name);
    const now = new Date().toISOString();
    rows.forEach((row) => {
      const r = new Record(c);
      if (c.fields.getByName("created_at")) r.set("created_at", now);
      for (const k in row) r.set(k, row[k]);
      app.save(r);
    });
  }
  seed("residents", [
    { id: "iep", name: "Iep", tree: "iep", color: "var(--iep)", sort: 0, is_home: true, away_label: "" },
    { id: "berk", name: "Berk", tree: "berk", color: "var(--berk)", sort: 1, is_home: false, away_label: "bij ouders" },
    { id: "eik", name: "Eik", tree: "eik", color: "var(--eik)", sort: 2, is_home: true, away_label: "" },
  ]);
  seed("chores", [
    { id: "wc", task: "WC", ritme: "wekelijks", who: "Eik", last_done: "2026-10-08", sort: 0 },
    { id: "keuken", task: "Keuken", ritme: "2-wekelijks", who: "Iep", last_done: "2026-09-30", sort: 1 },
    { id: "hal", task: "Hal", ritme: "2-wekelijks", who: "Berk", last_done: "2026-10-06", sort: 2 },
    { id: "badkamer", task: "Badkamer", ritme: "maandelijks", who: "Iep", last_done: "2026-09-22", sort: 3 },
  ]);
  seed("recipes", [{
    title: "Pasta pesto", time_min: 20,
    ingredients: ["300 g pasta", "1 pot groene pesto", "150 g kerstomaatjes", "1 bol mozzarella", "handje pijnboompitten"],
    steps: "1. Kook de pasta beetgaar.\n2. Halveer de tomaatjes, scheur de mozzarella.\n3. Meng pasta met pesto, roer tomaat en mozzarella erdoor.\n4. Rooster de pijnboompitten en strooi erover.",
  }]);
  seed("quotes", [{ text: "Wie het laatst lacht, doet de afwas.", author: "Berk" }, { text: "Een boom groeit niet in één dag.", author: "Iep" }]);
  seed("dib_items", [{ name: "Wasmachine", icon: "🧺", sort: 0 }, { name: "Droger", icon: "🌀", sort: 1 }]);
  seed("turf_items", [{ name: "Bier", icon: "🍺", price_cents: 80, stock: null, active: true, sort: 0 },
    { name: "Fris", icon: "🥤", price_cents: 60, stock: null, active: true, sort: 1 }]);
}, (app) => {
  ["turf_marks", "turf_items", "settlement_transfers", "expense_shares", "expenses", "turf_settlements", "settlements",
    "event_rsvp", "events", "dib_claims", "dib_items", "chore_log", "profiles", "plans", "quotes", "recipes", "shopping",
    "chores", "day_notes", "meals", "residents"].forEach((n) => {
    try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {}
  });
});
