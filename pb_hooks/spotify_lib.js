// De Bosboom — Spotify-afstandsbediening (server). Wordt geladen door bosboom.pb.js.
// De Pi speelt zelf geen Spotify: hij stuurt alleen opdrachten (speel, pauze, volgende) naar Spotify,
// en een speaker die zelf Spotify kan (bv. de Google Nest) speelt het af.
// Alleen het huisaccount mag dit. De sleutels van Spotify blijven op de server (collectie "spotify").
//
// Koppelen gaat met "Authorization Code + PKCE": daar is geen geheim (client secret) voor nodig,
// alleen het Client ID van de app die je op developer.spotify.com aanmaakt.

// Voor de tests kun je een nep-Spotify aanwijzen.
const ACCOUNTS = $os.getenv("SPOTIFY_ACCOUNTS_URL") || "https://accounts.spotify.com";
const API = $os.getenv("SPOTIFY_API_URL") || "https://api.spotify.com";

function fail(code) { throw new BadRequestError(code); }

function requireHuis(app, authId) {
  let huis = false;
  try { huis = app.findRecordById("profiles", authId).getBool("huis"); } catch (_) {}
  if (!huis) throw new ForbiddenError("geen_toegang");
}

// Er is één rij met de koppeling; die maken we aan als hij er nog niet is.
function link(app) {
  try { return app.findFirstRecordByFilter("spotify", "id != ''"); } catch (_) {}
  const rec = new Record(app.findCollectionByNameOrId("spotify"));
  app.save(rec);
  return rec;
}

const form = (o) => Object.keys(o).map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(o[k])).join("&");

// Sleutels ophalen of verversen bij Spotify en bewaren.
function token(app, rec, params) {
  let res;
  try {
    res = $http.send({
      url: ACCOUNTS + "/api/token", method: "POST", timeout: 15,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form(Object.assign({ client_id: rec.getString("client_id") }, params)),
    });
  } catch (_) { fail("spotify_onbereikbaar"); }
  if (res.statusCode !== 200 || !res.json || !res.json.access_token) {
    // Spotify wil deze koppeling niet meer: weggooien, dan kan er opnieuw gekoppeld worden.
    if (res.statusCode === 400 || res.statusCode === 401) {
      rec.set("access_token", ""); rec.set("refresh_token", ""); rec.set("expires_at", "");
      app.save(rec);
      fail("spotify_opnieuw_koppelen");
    }
    fail("spotify_onbereikbaar");
  }
  rec.set("access_token", res.json.access_token);
  if (res.json.refresh_token) rec.set("refresh_token", res.json.refresh_token);
  rec.set("expires_at", new Date(Date.now() + (res.json.expires_in || 3600) * 1000).toISOString());
  app.save(rec);
}

// Een verzoek aan de Spotify Web API. Ververst de sleutel als die (bijna) verlopen is.
function api(app, rec, method, path, body) {
  if (!rec.getString("refresh_token")) fail("spotify_niet_gekoppeld");
  const send = () => {
    try {
      return $http.send({
        url: API + path, method, timeout: 15,
        headers: { Authorization: "Bearer " + rec.getString("access_token"), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : "",
      });
    } catch (_) { fail("spotify_onbereikbaar"); }
  };
  const refresh = () => token(app, rec, { grant_type: "refresh_token", refresh_token: rec.getString("refresh_token") });
  if (!rec.getString("access_token") || rec.getString("expires_at") < new Date(Date.now() + 30000).toISOString()) refresh();
  let res = send();
  if (res.statusCode === 401) { refresh(); res = send(); }
  return res;
}

// Antwoord op een opdracht: gelukt, of een melding die de app kent.
function done(res) {
  if (res.statusCode >= 200 && res.statusCode < 300) return;
  const err = (res.json && res.json.error) || {};
  if (err.reason === "NO_ACTIVE_DEVICE" || res.statusCode === 404) fail("spotify_geen_speaker");
  if (err.reason === "PREMIUM_REQUIRED" || res.statusCode === 403) fail("spotify_premium");
  if (res.statusCode === 429) fail("spotify_te_druk");
  fail("spotify_onbereikbaar");
}

const q = (o) => { const s = form(o); return s ? "?" + s : ""; };
const dev = (id) => (id ? { device_id: id } : {});

const CALLS = {
  // Wat speelt er, en op welke speakers kan het? De app vraagt dit om de paar seconden.
  state(app) {
    const rec = link(app);
    const out = { connected: !!rec.getString("refresh_token"), player: null, devices: [],
      configured: !!rec.getString("client_id"), client_id: rec.getString("client_id") };
    if (!out.connected) return out;
    const p = api(app, rec, "GET", "/v1/me/player?additional_types=track,episode");
    if (p.statusCode === 200 && p.json) {
      const it = p.json.item || {}, d = p.json.device || {};
      out.player = {
        is_playing: !!p.json.is_playing, title: it.name || "",
        artist: (it.artists || []).map((a) => a.name).join(", ") || (it.show && it.show.name) || "",
        device_id: d.id || "", device_name: d.name || "",
        volume: typeof d.volume_percent === "number" ? d.volume_percent : null,
      };
    }
    const ds = api(app, rec, "GET", "/v1/me/player/devices");
    if (ds.statusCode === 200 && ds.json) {
      out.devices = (ds.json.devices || []).filter((x) => x.id && !x.is_restricted)
        .map((x) => ({ id: x.id, name: x.name, active: !!x.is_active }));
    }
    return out;
  },
  // Jouw afspeellijsten (de eerste 20), om er een te starten.
  playlists(app) {
    const res = api(app, link(app), "GET", "/v1/me/playlists?limit=20");
    if (res.statusCode !== 200 || !res.json) return [];
    return (res.json.items || []).filter((x) => x && x.uri).map((x) => ({ uri: x.uri, name: x.name }));
  },
  // Het Client ID van de Spotify-app bewaren (eenmalig). Een ander ID betekent opnieuw koppelen.
  config(app, a) {
    const id = String(a.client_id || "").trim();
    if (!/^[0-9a-zA-Z]{20,64}$/.test(id)) fail("spotify_client_id");
    const rec = link(app);
    if (rec.getString("client_id") !== id) { rec.set("access_token", ""); rec.set("refresh_token", ""); rec.set("expires_at", ""); }
    rec.set("client_id", id);
    app.save(rec);
  },
  // Terug van het inlogscherm van Spotify: de code omruilen voor sleutels.
  connect(app, a) {
    const rec = link(app);
    if (!rec.getString("client_id")) fail("spotify_client_id");
    if (!a.code || !a.verifier || !a.redirect_uri) fail("spotify_opnieuw_koppelen");
    token(app, rec, { grant_type: "authorization_code", code: String(a.code), redirect_uri: String(a.redirect_uri), code_verifier: String(a.verifier) });
  },
  disconnect(app) {
    const rec = link(app);
    rec.set("access_token", ""); rec.set("refresh_token", ""); rec.set("expires_at", "");
    app.save(rec);
  },
  // Opdrachten: play (evt. met device_id en uri van een afspeellijst), pause, next, prev, volume, transfer.
  cmd(app, a) {
    const rec = link(app);
    const id = a.device_id ? String(a.device_id) : "";
    switch (a.action) {
      case "play": return done(api(app, rec, "PUT", "/v1/me/player/play" + q(dev(id)), a.uri ? { context_uri: String(a.uri) } : null));
      case "pause": return done(api(app, rec, "PUT", "/v1/me/player/pause" + q(dev(id))));
      case "next": return done(api(app, rec, "POST", "/v1/me/player/next" + q(dev(id))));
      case "prev": return done(api(app, rec, "POST", "/v1/me/player/previous" + q(dev(id))));
      case "volume": {
        const v = Math.max(0, Math.min(100, Math.round(Number(a.percent))));
        if (isNaN(v)) fail("spotify_onbereikbaar");
        return done(api(app, rec, "PUT", "/v1/me/player/volume" + q(Object.assign({ volume_percent: v }, dev(id)))));
      }
      case "transfer":
        if (!id) fail("spotify_geen_speaker");
        return done(api(app, rec, "PUT", "/v1/me/player", { device_ids: [id], play: true }));
    }
    throw new NotFoundError("niet_gevonden");
  },
};

function call(e) {
  const fn = CALLS[e.request.pathValue("name")];
  if (!fn) throw new NotFoundError("niet_gevonden");
  requireHuis(e.app, e.auth ? e.auth.id : "");
  const out = fn(e.app, e.requestInfo().body || {});
  return out === undefined ? null : out;
}

module.exports = { call };
