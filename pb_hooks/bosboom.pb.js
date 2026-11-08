/// <reference path="../pb_data/types.d.ts" />
// De Bosboom — PocketBase hooks. De logica staat in bosboom_lib.js (PocketBase laadt elke
// handler los, daarom de require binnen elke functie).

// De app-bestanden (html/css/js) altijd even nakijken bij de Pi, zodat een browser of Cloudflare
// na een update geen oude versie blijft tonen. Ongewijzigde bestanden komen gewoon uit de cache (304).
routerUse((e) => {
  const p = e.request.url.path;
  if (!p.startsWith("/api/") && !p.startsWith("/_/")) e.response.header().set("Cache-Control", "no-cache");
  return e.next();
});

// Standaardwaarden bij aanmaken via de app (wie ben ik, vandaag, ...)
onRecordCreateRequest((e) => {
  require(`${__hooks}/bosboom_lib.js`).requestDefaults(e);
  e.next();
});

// Bewerken via de app (eigen opmerking, naam blijft staan)
onRecordUpdateRequest((e) => {
  require(`${__hooks}/bosboom_lib.js`).requestUpdate(e);
  e.next();
});

// Huisregels bij elke opslag
onRecordCreate((e) => {
  const L = require(`${__hooks}/bosboom_lib.js`);
  L.beforeSave(e.app, e.record, true);
  e.next();
  L.afterSave(e.app, e.record, true);
});
onRecordUpdate((e) => {
  const L = require(`${__hooks}/bosboom_lib.js`);
  L.beforeSave(e.app, e.record, false);
  e.next();
  L.afterSave(e.app, e.record, false);
});
onRecordDelete((e) => {
  e.next();
  require(`${__hooks}/bosboom_lib.js`).afterDelete(e.app, e.record);
});

// Server-functies: POST /api/bosboom/{naam} met de argumenten als JSON (db.call in de app)
routerAdd("POST", "/api/bosboom/{name}", (e) => {
  return e.json(200, require(`${__hooks}/bosboom_lib.js`).call(e));
}, $apis.requireAuth("users"));
