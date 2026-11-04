# CLAUDE.md — BosboomBeheer

Briefing for Claude (and other AI assistants). This repo is the single source of truth for the
Bosboom house app; if a chat disagrees with this file, this file wins. Owner: Hugo.

## What it is

A house dashboard for one student house, **De Bosboom**, with three housemates named after trees:
**Iep, Berk, Eik**. Used on phones and on an old phone mounted on the wall in the house (always on).
Live: **https://bosboombeheer.hugoreijersen.workers.dev**.

Not to be confused with **Huispot** (repo `Hugoreijersen/Huispot`): Huispot is the multi-house product
that grew out of this prototype. BosboomBeheer stays a separate, single-house app. Don't copy code or
decisions between them unless Hugo asks.

## How it works

- `index.html` = the whole app (HTML + CSS + JS in one file). No build step, no framework, no npm.
  `bosboom-live.html` is an identical copy (kept by Hugo; edit `index.html`).
- Backend: **Supabase** project ref `ulldrfuutnvulimpbhdp` (URL + publishable key are in `index.html`;
  that key is meant to be public). Data is only readable/writable when logged in (RLS).
- `01_schema.sql` (tables + start data) and `02_auth_and_policies.sql` (login link + policies) are the
  database as set up in the Supabase SQL editor.
- Tables: `residents` (the three trees + home/away), `meals`, `day_notes`, `chores`, `shopping`, `recipes`,
  `quotes`, `plans` (weekend plans per day per person), `profiles` (logged-in user → tree, claimed on first login).
- The live layer is the block `SUPABASE LIVE-LAAG` at the bottom of `index.html`: `loadAll` on open,
  `persist…` functions per action, one realtime channel so other devices update within a second.
- Login: email + password via Supabase Auth; email confirmation is off. Hugo deleted/recreated accounts
  himself; housemates each have their own account and claim their tree.
- Hosting: Cloudflare Worker **bosboombeheer**, deployed by **direct upload** (not yet linked to this repo).
- Icons: `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon-32.png`, `manifest.webmanifest`
  (green coat-of-arms logo "BosBoom"; the logo swaps colour in light mode).

## Features (Hugo's explicit wishes — keep them)

- **Thuis:** one tree per housemate; tap the whole tile to toggle home/away; editable away label ("ouders", "Taizé").
- **Eten:** per person per day blank / Eet mee / Kookt / **Anders** (word "Anders", not "Niet"); cooking implies
  eating; several cooks allowed; guests per person as a number; deadline 17:00. Day notes shown as
  `Naam: tekst` ("Iep: Daan en Bart komen"), added like quotes, also for later days.
- **Week:** week starts on **Sunday**; navigate by week number; pick a day, then fill it in; weekend plans per person.
- **Schoonmaak:** fixed tasks — WC weekly, Keuken 2-weekly, Hal 2-weekly, Badkamer monthly — with last date and
  next date; "Klaar" passes the task to the next person. No add/delete in normal use (dummy-proof).
- **Boodschappen, Recepten, Quotes** (quote of the day: random, stable per day, with history and date).
- Seasons and weather (Open-Meteo) in the header; the day switches automatically.
- UI rules: Dutch text, no subtitles under headings, whole tiles are hit targets, big tap targets.

## Rules

- Keep it one static `index.html`; no build tools or dependencies.
- Never put the Supabase secret key or database password anywhere in this repo. Hugo owns all accounts
  and sets secrets himself.
- Database changes: write a new numbered SQL file (`03_….sql`), explain it in plain words, Hugo runs it in
  the Supabase SQL editor. Never weaken the RLS policies.
- **Dashboard settings (Supabase, Cloudflare, GitHub): Hugo clicks them himself.** Give short exact steps
  (menu path, field, value). Don't operate his browser unless he asks.
- Commits and PR titles follow Conventional Commits (`feat(eten): …`, `fix: …`, `docs: …`). Work on a branch
  and open a PR; Hugo merges.
- Test changes in a browser at phone width (and wall-phone size) before handing over; check that the realtime
  sync still works with two windows.

## How Hugo works

- A few sentences unless he asks for depth. Ask a question only when the answer changes what you do or he must
  decide; one question at a time. Answer in his language (Dutch or English).
- Be transparent, explain in plain words, let him decide; he wants to understand and learn.

## Open items

1. Link this repo to the Cloudflare Worker so every merge goes live automatically. Before that, move the site
   files into a folder (e.g. `public/`) with a `wrangler.jsonc` pointing at it, so the SQL files and README are
   not published with the site.
2. Connect Hugo's domain **berkeikiep.nl** (on Cloudflare) to the Worker.
3. Wall phone: keep the screen awake (Wake Lock API) and dim it at night.
4. Housemates on GitHub: Settings → Collaborators → Add people (they can push branches and open/merge PRs;
   only Hugo can change settings).
5. README says `sql/…` but the SQL files are at the top level — fix the README or move the files.
