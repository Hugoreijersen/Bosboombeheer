# CLAUDE.md — De Bosboom

Briefing for Claude (and other AI assistants). This repo is the source of truth for the Bosboom house app;
if a chat disagrees with this file, this file wins. Owner: Hugo. Housemate Berk also pushes to the repo.

## What it is

A house dashboard for one student house, **De Bosboom**, with three housemates named after trees:
**Iep, Berk, Eik** (plus Mandarijn, Berk's partner, as a shared thuis/weg toggle on Berk's card).
Used on phones and on a fixed touchscreen in the house (kiosk).

- Live: **https://berkeikiep.nl** (Cloudflare Tunnel to the Pi).
- Also reachable via Tailscale Funnel, and in the house at `http://<pi-ip>:8090`.

Not to be confused with **Huispot** (repo `Hugoreijersen/Huispot`), the multi-house product that grew out of
this prototype. Don't copy code or decisions between them unless Hugo asks.

## How it works

- **Static app, no build step, no framework, no npm**: `index.html`, `css/`, `js/` (plain scripts loaded in a
  fixed order at the bottom of `index.html`). `README.md` has the file map.
- **Backend: PocketBase** (v0.40.6) on a **Raspberry Pi 3** in the house. It stores the data, handles login and
  realtime, and serves the app itself on port 8090.
  - `pb_migrations/`: all collections, API rules and start data.
  - `pb_hooks/`: the house rules on the server; they reuse `js/rules.js`, so app and server agree.
  - `js/db.js` is the ONLY file that talks to the backend (`list`, `insert`, `update`, `upsert`, `remove`,
    `call`, `subscribe`, `auth`).
- `sql/` is the old Supabase version, kept as the specification that the migrations and hooks follow.
  Supabase and the Cloudflare Worker are no longer used.
- **Kiosk** (`?kiosk=1`, see `js/scherm.js`): on-screen keyboard (`js/toetsenbord.js`), drag-to-scroll because
  the touchscreen reports itself as a mouse (`js/vegen.js`), and a light mode without animations or shadows
  because the Pi 3 is slow (`css/huis.css`, `js/sfeer.js`).

## The Pi

- Raspberry Pi OS (Debian 13), labwc/Wayland, 800x480 screen rotated to portrait. User `bosboombeheer`,
  repo at `~/Bosboombeheer`.
- `deploy/install.sh` installs the app to `/opt/bosboom` as systemd service `bosboom` (data in
  `/opt/bosboom/pb_data`, never in the repo).
- `deploy/kiosk.sh`: Chromium in kiosk mode with a low-memory flag set; it clears Chromium's BrowserMetrics on
  every start, because those once filled the SD card.
- `deploy/rotate.sh`: screen rotation, first line of the labwc autostart.
- `deploy/screen.sh`: screen on/off at night.
- `deploy/funnel.sh` (Tailscale) and `deploy/tunnel.sh` (Cloudflare Tunnel, Free plan, token passed as argument).
- `deploy/README.md` has every step in Dutch.
- Needs a proper 5V 2.5A supply: under-voltage throttles the CPU and makes the kiosk unusable.

## Workflow

1. Work on a branch; preview locally with `./dev.sh` (Mac/Linux) or `dev.ps1` (Windows). It downloads
   PocketBase into a cache dir and serves on http://localhost:8090 with a throwaway database.
2. Tests: `node tests/rules.test.js` and `PB_BIN=<pocketbase> node tests/pb.test.mjs`.
3. Open a PR; Hugo merges.
4. The Pi updates itself: timer `bosboom-update` (set up by `install.sh`) runs `deploy/autoupdate.sh` every 2 minutes,
   which pulls main, runs `install.sh` and reloads the kiosk. Run `./deploy/kiosk.sh` by hand when that script changed.

## Rules

- Keep it static: no build tools, frameworks or CDN dependencies (the PocketBase SDK lives in `js/vendor/`).
- Never put secrets in the repo or in chat: the PocketBase superuser password, the Cloudflare tunnel token.
  Hugo owns all accounts.
- Schema changes: a new numbered file in `pb_migrations/`. House rules go in `js/rules.js` and are enforced
  in `pb_hooks/`. Never weaken the API rules (data only for logged-in users).
- **Dashboard settings (PocketBase admin, Cloudflare, Tailscale, GitHub): Hugo clicks them himself.** Give short
  exact steps (menu path, field, value).
- Commits and PR titles follow Conventional Commits (`feat(eten): …`, `fix: …`, `docs: …`).
- Test at phone width and at 480x800 with `?kiosk=1`; check live sync with two windows.

## Features (Hugo's explicit wishes — keep them)

- **Huisaccount:** one shared login not tied to a person, for the kiosk (`profiles.huis`); its comments are by "Huis".
- **Thuis:** one tree per housemate; tap the whole tile to toggle home/away; editable away label.
- **Eten:** per person per day blank / Eet mee / Kookt / **Anders** (word "Anders", not "Niet"); cooking implies
  eating; several cooks allowed; guests as a number; deadline 17:00; day notes as `Naam: tekst`. The cook enters
  the grocery cost, which becomes an expense in DeeldeDuit.
- **Agenda** (kring claims the house; huisavond/activiteit are open), **Dibs**, **Streeplijst**,
  **DeeldeDuit**, **Statistieken**, **Schoonmaak** (fixed tasks; "Klaar" passes to the next person),
  **Boodschappen, Recepten, Quotes**. The rules are in `README.md` under "Huisregels".
- **Radio** (`js/radio.js`): internet radio stations in a fifth tab, shown only on the huisaccount. One `<audio>`
  element in the kiosk browser; the Pi sends it to its default output (a Bluetooth speaker, paired by hand).
- **Spotify remote** (`js/spotify.js`, `pb_hooks/spotify_lib.js`), under the radio: shows what plays and controls a
  speaker that plays Spotify itself (the Nest). The Pi never plays Spotify (too heavy, and librespot is blocked for
  this account). Linked once over https with PKCE; the tokens stay server-side in the locked `spotify` collection.
- Week starts on **Sunday**. Seasons and weather (Open-Meteo) in the header.
- UI: Dutch text, no subtitles under headings, whole tiles are hit targets, big tap targets.

## How Hugo works

- A few sentences unless he asks for depth; answer in his language (Dutch or English).
- For this project Claude does the heavy lifting: write the code, test it, open the PR.
- Be transparent and explain in plain words; Hugo decides.

## Open items

- Decide whether sign-up should be closed now that the app is public on berkeikiep.nl.
- `bosboom-live.html` is an old single-file copy from the Supabase era; remove it once Hugo agrees.
