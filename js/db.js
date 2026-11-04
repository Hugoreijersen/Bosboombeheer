// De Bosboom — data-laag. Dit is de ENIGE plek die met de backend praat.
// Alles gaat erin en eruit als gewone objecten (rijen met dezelfde kolomnamen als de tabellen).
// Wissel je van backend (bv. PocketBase op de Pi), dan vervang je alleen dit bestand
// en houd je dezelfde functies aan:
//
//   db.list(table, {where, order, desc, limit})  -> [rij]
//        where: {kolom: waarde | [waarden] | null | {gte|gt|lte|lt|neq: waarde}}
//   db.insert(table, rij)                        -> rij (met id)
//   db.update(table, match, velden)              -> [rij]      match: {kolom: waarde}
//   db.upsert(table, rij, sleutels)              -> rij        sleutels: ["day","resident_id"]
//   db.remove(table, match)                      -> void
//   db.call(naam, args)                          -> resultaat  (huisregels die op de server moeten)
//   db.subscribe(table, cb)                      -> void       (cb bij elke wijziging van een ander)
//   db.auth.*                                    -> login, zie onderaan
//
// Fouten gooien een DbError met een vaste .code (zie CODES), zodat de schermen
// dezelfde meldingen tonen, welke backend er ook onder zit.

class DbError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

const db = (() => {
  const SB_URL = "https://ulldrfuutnvulimpbhdp.supabase.co";
  const SB_KEY = "sb_publishable_nvV2Y8pe__XYgiZFdPy3dg_FXu-jwiq"; // publishable: hoort openbaar te zijn, RLS beschermt de data
  const sb = window.supabase.createClient(SB_URL, SB_KEY);

  // Codes die de app kent. Server-functies geven ze als foutmelding terug (raise exception 'huis_geclaimd').
  const CODES = ["huis_geclaimd", "dib_bezet", "kring_niet_aansluiten", "tijd_ongeldig", "te_lang", "al_afgerekend",
    "niets_af_te_rekenen", "al_betaald", "item_niet_actief", "geen_deelnemers", "niet_gevonden"];
  function toError(e) {
    const msg = (e && e.message) || String(e);
    const code = CODES.find((c) => msg.includes(c))
      || (msg.includes("dib_geen_overlap") ? "dib_bezet" : null)
      || (msg.includes("kring_geen_overlap") ? "huis_geclaimd" : null)
      || (e && e.code === "23P01" ? "overlap" : null)          // exclusion constraint
      || (e && e.code === "23505" ? "bestaat_al" : null)
      || (e && e.code === "42501" ? "geen_toegang" : null)
      || "onbekend";
    return new DbError(code, msg);
  }
  const ok = (r) => { if (r.error) throw toError(r.error); return r.data; };

  function filter(q, where) {
    for (const [k, v] of Object.entries(where || {})) {
      if (v === null) q = q.is(k, null);
      else if (Array.isArray(v)) q = q.in(k, v);
      else if (typeof v === "object" && !(v instanceof Date)) for (const [op, x] of Object.entries(v)) q = q[op](k, x);
      else q = q.eq(k, v);
    }
    return q;
  }

  const channel = sb.channel("bosboom-live");
  let subscribed = false;

  return {
    async list(table, { where, order, desc, limit } = {}) {
      let q = filter(sb.from(table).select("*"), where);
      for (const o of [].concat(order || [])) q = q.order(o, { ascending: !desc });
      if (limit) q = q.limit(limit);
      return ok(await q) || [];
    },
    async insert(table, row) { return ok(await sb.from(table).insert(row).select().single()); },
    async update(table, match, fields) { return ok(await filter(sb.from(table).update(fields), match).select()); },
    async upsert(table, row, keys) { return ok(await sb.from(table).upsert(row, { onConflict: keys.join(",") }).select().single()); },
    async remove(table, match) { ok(await filter(sb.from(table).delete(), match)); },
    async call(name, args) { return ok(await sb.rpc(name, args || {})); },
    subscribe(table, cb) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, cb);
      if (!subscribed) { subscribed = true; setTimeout(() => channel.subscribe(), 0); }
    },

    auth: {
      // -> {id, email} of null
      async user() { const { data } = await sb.auth.getSession(); return data.session ? data.session.user : null; },
      async signIn(email, password) { const r = await sb.auth.signInWithPassword({ email, password }); if (r.error) throw new DbError("login", r.error.message); return r.data.session ? r.data.session.user : null; },
      // -> user, of null als de e-mail eerst bevestigd moet worden
      async signUp(email, password) { const r = await sb.auth.signUp({ email, password }); if (r.error) throw new DbError("login", r.error.message); return r.data.session ? r.data.session.user : null; },
      async signOut() { await sb.auth.signOut(); },
      async resetPassword(email) { const r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (r.error) throw new DbError("login", r.error.message); },
      async setPassword(password) { const r = await sb.auth.updateUser({ password }); if (r.error) throw new DbError("login", r.error.message); },
      // cb() wordt aangeroepen als iemand terugkomt via de resetlink
      onRecovery(cb) { sb.auth.onAuthStateChange((ev) => { if (ev === "PASSWORD_RECOVERY") cb(); }); },
    },
  };
})();
