/// <reference path="../pb_data/types.d.ts" />
// De Bosboom — Spotify-afstandsbediening in het Radio-tabblad.
// Hier staat de koppeling met één Spotify-account (Client ID en de sleutels die Spotify teruggeeft).
// Alle regels staan op null: de app kan er niet bij, alleen de server (pb_hooks/spotify_lib.js).
// De sleutels komen dus nooit in een browser terecht.
migrate((app) => {
  const text = (name) => ({ name, type: "text", max: 2000 });
  app.save(new Collection({
    type: "base", name: "spotify",
    fields: [text("client_id"), text("access_token"), text("refresh_token"), text("expires_at")],
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
  }));
}, (app) => {
  app.delete(app.findCollectionByNameOrId("spotify"));
});
