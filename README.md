# De Bosboom

Een huis-dashboard voor De Bosboom (Iep, Berk, Eik): wie is thuis, wie eet mee,
wie kookt, de agenda (kring of huisavond), dibs op de wasmachine, de streeplijst,
DeeldeDuit (kosten delen), het schoonmaakrooster, boodschappen, recepten, quotes en
statistieken — met seizoenen en weer. De app werkt op telefoon en op een vast touchscreen in huis, en deelt alles
live tussen alle apparaten.

## Hoe het in elkaar zit

```
index.html                     de opmaak van alle schermen
css/base.css                   kleuren, lettertypes en de oorspronkelijke secties
css/huis.css                   agenda, dibs, streeplijst, DeeldeDuit, statistieken
js/core.js                     bewoners, datums, state, hulpjes (eerst geladen)
js/rules.js                    de huisregels als gewone functies (geld, kring, dibs)
js/db.js                       de ENIGE plek die met de backend praat (PocketBase)
js/vendor/                     de PocketBase-bibliotheek voor de browser (lokaal, geen CDN)
pb_migrations/                 PocketBase: alle tabellen, toegangsregels en startdata
pb_hooks/                      PocketBase: de huisregels op de server (gebruikt js/rules.js)
deploy/                        installeren op de Raspberry Pi + kiosk (zie deploy/README.md)
js/app.js                      inladen, opslaan, live bijwerken
js/thuis.js eten.js schoonmaak.js lijsten.js sfeer.js    de oorspronkelijke secties
js/agenda.js dibs.js streep.js duit.js stats.js          de nieuwe secties
js/scherm.js                   schermstand: telefoon of kiosk (per apparaat)
js/auth.js                     login en boom claimen; start de app (laatst geladen)
sql/                           de oude Supabase-versie (blijft als naslag/specificatie)
sql/01_schema.sql              de database-tabellen + startdata
sql/02_auth_and_policies.sql   login-koppeling + toegangsregels (security)
sql/03_huispot_features.sql    tabellen en regels voor de nieuwe secties
sql/04_eten_kosten.sql         boodschappen van de kok -> DeeldeDuit
tests/                         node tests/rules.test.js  en  PB_BIN=pocketbase node tests/pb.test.mjs
```

Er is bewust **geen build-stap en geen framework**. Het zijn gewone statische
bestanden; de scripts worden in vaste volgorde geladen (zie onderaan `index.html`). De "backend" is **PocketBase** (database + login + realtime in één klein programma)
op de Raspberry Pi in huis. PocketBase serveert ook de app zelf; de browser praat er
rechtstreeks mee. Alles draait dus lokaal, zonder cloud-database.

## Hoe het werkt (in het kort)

1. **Login** — iedere huisgenoot maakt één account (e-mail + wachtwoord) in PocketBase.
   Wachtwoorden staan nooit in deze code; PocketBase bewaart ze versleuteld.
2. **Boom claimen** — bij de eerste login kies je welke boom je bent (Iep/Berk/Eik).
   Dat wordt opgeslagen in de tabel `profiles` (één boom per persoon).
3. **Inladen** — bij openen haalt de app de huidige stand op uit de database (`loadAll`).
4. **Opslaan** — elke actie schrijft naar de database (bv. `persistHome` voor thuis/weg).
5. **Realtime** — wijzigt iemand iets, dan werken de andere apparaten binnen een seconde bij.


## Tabbladen

Onderin staat een menubalk met vier tabbladen:
**Huis** (wie is thuis, eten, agenda, weer, quote), **Praktisch** (huistaken, dibs,
boodschappen, streeplijst, recepten), **DeeldeDuit** en **Statistieken**.
Kiest iemand "Kookt", dan vraagt een pop-up wat de boodschappen kostten; dat komt als
uitgave in DeeldeDuit, verdeeld over wie meeeet (gasten tellen bij wie ze meenam).

## Huisregels

- **Agenda:** een *kring* claimt het huis. Er kan dan niets anders gepland worden en
  niemand kan zich aanmelden. Een *huisavond* of *activiteit* is open: iedereen geeft
  aan of hij erbij is, en ze mogen naast elkaar bestaan.
- **Dibs:** een ding (wasmachine, droger) kan nooit twee keer tegelijk geclaimd zijn,
  nu of later. "Klaar" geeft het meteen vrij.
- **Streeplijst:** iedereen mag voor iedereen strepen (zoals op de koelkast). De prijs
  ligt vast op het moment van strepen. Afrekenen zet de open strepen in DeeldeDuit.
- **DeeldeDuit:** alles in hele centen; de overgebleven centen gaan naar de grootste rest,
  zodat elk scherm precies hetzelfde rekent. Afrekenen maakt zo min mogelijk overboekingen.
  Afgerekende uitgaven zijn alleen-lezen; terugdraaien kan zolang er niets betaald is.

De regels staan in `js/rules.js` (snelle melding in de app) én op de server
(`pb_hooks/`, die dezelfde `js/rules.js` gebruikt), zodat ook twee telefoons tegelijk
ze niet kunnen omzeilen.

## Andere backend?

Alles wat met de backend praat staat in `js/db.js`, met bovenaan het contract
(`list`, `insert`, `update`, `upsert`, `remove`, `call`, `subscribe`, `auth`).
Zo is de app van Supabase naar PocketBase gegaan: alleen dat bestand is vervangen.
De Supabase-SQL in `sql/` is de specificatie die `pb_migrations/` en `pb_hooks/` volgen.

## De database-tabellen

| Tabel        | Waarvoor                                        |
|--------------|-------------------------------------------------|
| `residents`  | de drie bomen + thuis/weg-status                |
| `meals`      | eten per dag per persoon (status + gasten)      |
| `day_notes`  | opmerkingen bij het eten (per dag, met auteur)  |
| `chores`     | schoonmaakrooster (vaste taken)                 |
| `shopping`   | boodschappenlijst                               |
| `recipes`    | recepten                                        |
| `quotes`     | quotes                                          |
| `plans`      | weekendplannen (per dag per persoon)            |
| `profiles`   | koppeling ingelogde gebruiker → boom            |
| `chore_log`  | logboek: wie maakte wanneer wat schoon          |
| `events`, `event_rsvp` | agenda + wie er komt                  |
| `dib_items`, `dib_claims` | dingen om te dibsen + claims       |
| `turf_items`, `turf_marks`, `turf_settlements` | streeplijst   |
| `expenses`, `expense_shares`, `settlements`, `settlement_transfers` | DeeldeDuit |

## Sleutels & veiligheid

- Er staan **geen sleutels** in de code: de app praat met de PocketBase op hetzelfde adres.
- De data is **alleen te lezen/schrijven als je ingelogd bent** (API-regels in `pb_migrations/`).
- Het **beheer-account** (PocketBase `/_/`) en de database (`/opt/bosboom/pb_data` op de Pi)
  staan NIET in deze repo en horen dat ook nooit te doen.

## Draaien op de Raspberry Pi

Zie **[deploy/README.md](deploy/README.md)**: in het kort `sudo ./deploy/install.sh`
(PocketBase + de app als service) en `./deploy/kiosk.sh` (touchscreen start in de app,
scherm 's nachts uit). Updaten: `git pull && sudo ./deploy/install.sh`.

## Status

- **Pass 1 (klaar):** Supabase opgezet, database, realtime, login, security.
- **Pass 2a (klaar):** login + boom-claim + data inladen + "Wie is thuis?" live.
- **Pass 2b (volgt):** de overige secties (eten, schoonmaak, boodschappen,
  recepten, quotes, plannen) ook live opslaan.
- **Pass 3 (deze stap):** bestanden opgesplitst, data-laag, Agenda, Dibs, Streeplijst,
  DeeldeDuit en statistieken. Draai eerst `sql/03_huispot_features.sql` in Supabase.
- **Pass 4:** van Supabase naar PocketBase op de Pi, kiosk op het touchscreen.
- **Later:** bereikbaar buiten huis (Cloudflare Tunnel of Tailscale), PWA (installeren op telefoon).
