/// <reference path="../pb_data/types.d.ts" />
// De Bosboom — back-ups een maand bewaren in plaats van een week.
// De database is maar een paar MB, dus 30 back-ups kosten weinig ruimte (op de SD-kaart of in Backblaze B2).
migrate((app) => {
  const s = app.settings();
  s.backups.cronMaxKeep = 30;
  app.save(s);
}, (app) => {
  const s = app.settings();
  s.backups.cronMaxKeep = 7;
  app.save(s);
});
