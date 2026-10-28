# De Bosboom

Een huis-dashboard voor De Bosboom (Iep, Berk, Eik): wie is thuis, wie eet mee,
wie kookt, het schoonmaakrooster, boodschappen, recepten en quotes — met seizoenen
en weer. De app werkt op telefoon en op een vast touchscreen in huis, en deelt alles
live tussen alle apparaten.

## Hoe het in elkaar zit

```
index.html                     de hele app (1 bestand: HTML + CSS + JavaScript)
sql/01_schema.sql              de database-tabellen + startdata
sql/02_auth_and_policies.sql   login-koppeling + toegangsregels (security)
```

Er is bewust **geen build-stap en geen framework**. `index.html` is een gewone
statische pagina. De "backend" is **Supabase** (gehoste database + login + realtime);
de app praat daar rechtstreeks mee vanuit de browser.

## Hoe het werkt (in het kort)

1. **Login** — iedere huisgenoot maakt één account (e-mail + wachtwoord) via Supabase Auth.
   Wachtwoorden staan nooit in deze code; Supabase regelt dat.
2. **Boom claimen** — bij de eerste login kies je welke boom je bent (Iep/Berk/Eik).
   Dat wordt opgeslagen in de tabel `profiles` (één boom per persoon).
3. **Inladen** — bij openen haalt de app de huidige stand op uit de database (`loadAll`).
4. **Opslaan** — elke actie schrijft naar de database (bv. `persistHome` voor thuis/weg).
5. **Realtime** — wijzigt iemand iets, dan werken de andere apparaten binnen een seconde bij.

De belangrijkste code zit onderaan in `index.html`, in het blok
`SUPABASE LIVE-LAAG`. Daarboven staat de UI (overgenomen uit het ontwerp).

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

## Sleutels & veiligheid

- In `index.html` staan de **Project URL** en de **publishable key**. Die horen
  openbaar te zijn — ze mogen in de frontend staan.
- De data is **alleen te lezen/schrijven als je ingelogd bent** (Row Level Security).
- De **secret key** en het **database-wachtwoord** staan NIET in deze code en horen
  dat ook nooit te doen.

## Deployen (Cloudflare Pages)

Twee manieren:
- **Snel:** upload `index.html` direct in Cloudflare Pages (drag & drop).
- **Netjes (aanbevolen):** koppel deze GitHub-repo aan Cloudflare Pages. Dan gaat
  elke `git push` automatisch live. Framework preset: **None**. Build command: leeg.
  Output directory: `/` (de map met `index.html`).

## Status

- **Pass 1 (klaar):** Supabase opgezet, database, realtime, login, security.
- **Pass 2a (klaar):** login + boom-claim + data inladen + "Wie is thuis?" live.
- **Pass 2b (volgt):** de overige secties (eten, schoonmaak, boodschappen,
  recepten, quotes, plannen) ook live opslaan.
- **Later:** live weer (Open-Meteo), PWA (installeren op telefoon), kiosk op het touchscreen.
