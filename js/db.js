// De Bosboom — data-laag. Dit is de ENIGE plek die met de backend praat.
// Backend: PocketBase op de Raspberry Pi (zie pb_migrations/, pb_hooks/ en deploy/).
// Alles gaat erin en eruit als gewone objecten (rijen met dezelfde kolomnamen als de tabellen).
// Wissel je van backend, dan vervang je alleen dit bestand en houd je dezelfde functies aan:
//
//   db.list(table, {where, order, desc, limit})  -> [rij]
//        where: {kolom: waarde | [waarden] | null | {gte|gt|lte|lt|neq: waarde}}
//   db.insert(table, rij)                        -> rij (met id)
//   db.update(table, match, velden)              -> [rij]      match: {kolom: waarde}
//   db.upsert(table, rij, sleutels)              -> rij        sleutels: ["day","resident_id"]
//   db.remove(table, match)                      -> void
//   db.call(naam, args)                          -> resultaat  (huisregels die op de server moeten)
//   db.subscribe(table, cb)                      -> void       (cb bij elke wijziging)
//   db.auth.*                                    -> login, zie onderaan
//
// Fouten gooien een DbError met een vaste .code (zie CODES), zodat de schermen
// dezelfde meldingen tonen, welke backend er ook onder zit.

class DbError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

const db = (() => {
  // De app wordt door PocketBase zelf geserveerd, dus de server is hetzelfde adres als de pagina.
  // (Voor testen kun je window.BOSBOOM_PB_URL zetten.)
  const pb = new window.PocketBase(window.BOSBOOM_PB_URL || location.origin);
  pb.autoCancellation(false);   // de app doet vaak meerdere gelijke verzoeken tegelijk
  // Resetlink (…/#reset=TOKEN): meteen onthouden, want de tabbladen herschrijven de #.
  const RESET = /[#&]reset=([^&]+)/.exec(location.hash || "");
  const recoveryToken = () => (RESET ? decodeURIComponent(RESET[1]) : null);

  // Codes die de app kent. De server (pb_hooks) geeft ze als foutmelding terug.
  const CODES = ["huis_geclaimd", "dib_bezet", "kring_niet_aansluiten", "tijd_ongeldig", "te_lang", "al_afgerekend",
    "niets_af_te_rekenen", "al_betaald", "item_niet_actief", "geen_deelnemers", "niet_gevonden", "soort_ongeldig", "bestaat_al", "niet_jouw_opmerking", "geen_boom"];
  function toError(e) {
    const res = (e && e.response) || {};
    const msg = res.message || (e && e.message) || String(e);
    const fields = JSON.stringify(res.data || {});
    const low = msg.toLowerCase();   // PocketBase maakt van "dib_bezet" "Dib_bezet."
    const code = CODES.find((c) => low.includes(c))
      || (fields.includes("validation_not_unique") ? "bestaat_al" : null)
      || (e && (e.status === 403 || e.status === 401) ? "geen_toegang" : null)
      || (e && e.status === 400 && fields === "{}" && /^Failed to (create|update)/.test(msg) ? "geen_toegang" : null)   // regel van de collectie zegt nee
      || (e && e.status === 404 ? "niet_gevonden" : null)
      || (e && e.status === 0 ? "offline" : null)
      || "onbekend";
    return new DbError(code, fields !== "{}" ? msg + " " + fields : msg);
  }
  const wrap = (p) => p.catch((e) => { throw toError(e); });

  // Velden die "leeg" (null) kunnen zijn. PocketBase bewaart leeg als "", de app verwacht null.
  // (Json-velden zoals turf_items.stock en recipes.time_min kunnen gewoon null zijn.)
  const NULLABLE = {
    chore_log: ["chore_id"], dib_claims: ["note"], events: ["note"],
    expenses: ["settlement_id", "turf_settlement_id", "meal_day"], turf_marks: ["settlement_id"],
    settlement_transfers: ["paid_at", "paid_by"], profiles: ["resident_id"],
  };
  const JSON_FIELDS = { recipes: ["time_min", "ingredients"], turf_items: ["stock"] };
  const SYSTEM = ["collectionId", "collectionName", "expand"];

  function fromPb(table, rec) {
    const row = {};
    for (const k in rec) if (!SYSTEM.includes(k)) row[k] = rec[k];
    (NULLABLE[table] || []).forEach((k) => { if (row[k] === "") row[k] = null; });
    return row;
  }
  function toPb(table, row) {
    const out = {}, json = JSON_FIELDS[table] || [];
    for (const k in row) {
      const v = row[k];
      out[k] = v === undefined ? undefined : v === null && !json.includes(k) ? "" : v;
    }
    return out;
  }

  const OPS = { gte: ">=", gt: ">", lte: "<=", lt: "<", neq: "!=", eq: "=" };
  // where -> PocketBase filter-tekst (met veilige parameters)
  function filter(where) {
    const parts = [], params = {};
    let n = 0;
    const p = (v) => { const k = "p" + n++; params[k] = v === null ? "" : v; return "{:" + k + "}"; };
    for (const [k, v] of Object.entries(where || {})) {
      if (v === null) parts.push(`${k} = ''`);
      else if (Array.isArray(v)) parts.push(v.length ? "(" + v.map((x) => `${k} = ${p(x)}`).join(" || ") + ")" : "id = ''");
      else if (typeof v === "object" && !(v instanceof Date)) {
        for (const [op, x] of Object.entries(v)) {
          if (!OPS[op]) throw new DbError("onbekend", "onbekende vergelijking " + op);
          parts.push(`${k} ${OPS[op]} ${p(x instanceof Date ? x.toISOString() : x)}`);
        }
      } else parts.push(`${k} = ${p(v instanceof Date ? v.toISOString() : v)}`);
    }
    return parts.length ? pb.filter(parts.join(" && "), params) : "";
  }
  const sortOf = (order, desc) => [].concat(order || []).map((o) => (desc ? "-" : "") + o).join(",");

  async function find(table, where) {
    if (where && Object.keys(where).length === 1 && typeof where.id === "string") {
      try { return [await pb.collection(table).getOne(where.id)]; } catch (e) { if (e.status === 404) return []; throw e; }
    }
    return pb.collection(table).getFullList({ filter: filter(where), batch: 500 });
  }

  return {
    async list(table, { where, order, desc, limit } = {}) {
      const opts = { filter: filter(where), sort: sortOf(order, desc) };
      const rows = await wrap(limit
        ? pb.collection(table).getList(1, limit, Object.assign({ skipTotal: true }, opts)).then((r) => r.items)
        : pb.collection(table).getFullList(Object.assign({ batch: 500 }, opts)));
      return rows.map((r) => fromPb(table, r));
    },
    async insert(table, row) { return fromPb(table, await wrap(pb.collection(table).create(toPb(table, row)))); },
    async update(table, match, fields) {
      const recs = await wrap(find(table, match));
      const out = [];
      for (const r of recs) out.push(fromPb(table, await wrap(pb.collection(table).update(r.id, toPb(table, fields)))));
      return out;
    },
    async upsert(table, row, keys) {
      const match = {};
      keys.forEach((k) => (match[k] = row[k]));
      for (let attempt = 0; ; attempt++) {
        const [cur] = await wrap(find(table, match));
        try {
          return fromPb(table, cur
            ? await pb.collection(table).update(cur.id, toPb(table, row))
            : await pb.collection(table).create(toPb(table, row)));
        } catch (e) {
          const err = toError(e);
          if (err.code === "bestaat_al" && attempt === 0) continue;   // net door een ander aangemaakt: dan bijwerken
          throw err;
        }
      }
    },
    async remove(table, match) {
      for (const r of await wrap(find(table, match))) {
        try { await pb.collection(table).delete(r.id); } catch (e) { if (e.status !== 404) throw toError(e); }
      }
    },
    async call(name, args) { return wrap(pb.send("/api/bosboom/" + name, { method: "POST", body: args || {} })); },
    subscribe(table, cb) { pb.collection(table).subscribe("*", (ev) => cb(ev)).catch((e) => console.error("live", table, e)); },

    auth: {
      // -> {id, email} of null
      async user() {
        if (!pb.authStore.isValid) return null;
        try { await pb.collection("users").authRefresh(); } catch (e) { if (e.status === 401 || e.status === 403 || e.status === 404) { pb.authStore.clear(); return null; } }
        const m = pb.authStore.record;
        return m ? { id: m.id, email: m.email } : null;
      },
      async signIn(email, password) {
        try { const r = await pb.collection("users").authWithPassword(email, password); return { id: r.record.id, email: r.record.email }; }
        catch (e) { throw new DbError("login", e.status === 400 ? "Invalid login credentials" : (e.message || String(e))); }
      },
      // -> user (PocketBase vraagt geen e-mailbevestiging, je bent meteen ingelogd)
      async signUp(email, password) {
        try { await pb.collection("users").create({ email, password, passwordConfirm: password }); }
        catch (e) {
          const d = (e.response && e.response.data) || {};
          if (d.email && d.email.code === "validation_not_unique") throw new DbError("login", "User already registered");
          if (d.password) throw new DbError("login", "Password should be at least 6 characters");
          if (d.email) throw new DbError("login", "Dat e-mailadres klopt niet.");
          throw new DbError("login", e.message || String(e));
        }
        return this.signIn(email, password);
      },
      async signOut() { pb.authStore.clear(); },
      // Werkt alleen als er in PocketBase een mailserver (SMTP) is ingesteld, zie deploy/README.md
      async resetPassword(email) {
        try { await pb.collection("users").requestPasswordReset(email); } catch (e) { throw new DbError("login", e.message || String(e)); }
      },
      async setPassword(password) {
        const token = recoveryToken();
        try {
          if (token) await pb.collection("users").confirmPasswordReset(token, password, password);
          else await pb.collection("users").update(pb.authStore.record.id, { password, passwordConfirm: password });
        } catch (e) { throw new DbError("login", (e.response && e.response.data && e.response.data.password) ? "Password should be at least 6 characters" : (e.message || String(e))); }
        if (token) {   // via de resetlink: daarna gewoon opnieuw inloggen
          location.replace(location.pathname);
          return new Promise(() => {});
        }
      },
      // cb() wordt aangeroepen als iemand terugkomt via de resetlink (…/#reset=TOKEN)
      onRecovery(cb) { if (recoveryToken()) setTimeout(cb, 0); },
    },
  };
})();
