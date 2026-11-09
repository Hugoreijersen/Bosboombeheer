/// <reference path="../pb_data/types.d.ts" />
// De Bosboom — het huisaccount: een login die bij niemand hoort, voor het gedeelde scherm in huis.
// Een profiel met huis = true heeft geen boom; opmerkingen komen dan op naam van "Huis".
// Er is hooguit één huisaccount (je kunt er wel op meerdere apparaten mee inloggen).
migrate((app) => {
  const c = app.findCollectionByNameOrId("profiles");
  c.fields.add(new BoolField({ name: "huis" }));
  c.indexes.push("CREATE UNIQUE INDEX idx_profiles_huis ON profiles (huis) WHERE huis = TRUE");
  app.save(c);
}, (app) => {
  const c = app.findCollectionByNameOrId("profiles");
  c.indexes = c.indexes.filter((i) => !i.includes("idx_profiles_huis"));
  c.fields.removeByName("huis");
  app.save(c);
});
