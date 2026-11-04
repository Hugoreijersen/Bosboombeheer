/// <reference path="../pb_data/types.d.ts" />
// De Bosboom — PocketBase hooks. De logica staat in bosboom_lib.js (PocketBase laadt elke
// handler los, daarom de require binnen elke functie).

// Standaardwaarden bij aanmaken via de app (wie ben ik, vandaag, ...)
onRecordCreateRequest((e) => {
  require(`${__hooks}/bosboom_lib.js`).requestDefaults(e);
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
