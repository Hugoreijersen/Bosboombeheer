/// <reference path="../pb_data/types.d.ts" />
// De Bosboom — Mandarijn (bij Berk): of die thuis is, gedeeld voor iedereen (zie sql/05_partner_home.sql).
migrate((app) => {
  const c = app.findCollectionByNameOrId("residents");
  if (!c.fields.getByName("partner_home")) c.fields.add(new BoolField({ name: "partner_home" }));
  app.save(c);
}, (app) => {
  const c = app.findCollectionByNameOrId("residents");
  c.fields.removeByName("partner_home");
  app.save(c);
});
