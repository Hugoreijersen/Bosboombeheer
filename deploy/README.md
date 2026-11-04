# De Bosboom op de Raspberry Pi

De Pi draait **PocketBase** (database, login, live updates en de app zelf) en laat het
touchscreen opstarten in de app. Getest voor een Pi 3 (1 GB): PocketBase gebruikt zo'n
20–40 MB geheugen, de browser de rest.

## 1. Eenmalig installeren

Op de Pi, in een terminal (via SSH kan ook):

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/Hugoreijersen/Bosboombeheer.git ~/Bosboombeheer
cd ~/Bosboombeheer
sudo ./deploy/install.sh
```

Dat script:
- zet de tijdzone op Europe/Amsterdam;
- downloadt PocketBase (de juiste versie voor de processor, gecontroleerd met een checksum);
- kopieert de app naar `/opt/bosboom` en start hem als service `bosboom` (start vanzelf na een herstart);
- vraagt één keer om een **beheer-account** (alleen voor het beheerscherm, niet voor de app).

Daarna: de app op `http://<ip-van-de-pi>:8090/` (of `http://<naam>.local:8090/`),
het beheerscherm op `http://<ip-van-de-pi>:8090/_/`.
Iedere huisgenoot maakt in de app een account en claimt zijn boom, net als voorheen.

## 2. Kiosk op het touchscreen

Als de gewone gebruiker (zonder sudo), op Raspberry Pi OS **met bureaublad**:

```bash
./deploy/kiosk.sh              # scherm uit om 01:00, aan om 06:30
./deploy/kiosk.sh 23:30 07:00  # of zelf kiezen
sudo raspi-config              # System Options > Boot / Auto Login > Desktop Autologin
sudo reboot
```

**Staand scherm:** `./deploy/rotate.sh 90` (of `270` als hij op zijn kop staat, `0` = terug).
Dat draait het scherm én de touch mee, en blijft na een herstart.

De browser (Chromium) start schermvullend in de app en herstart vanzelf als hij crasht.
's Nachts gaat het scherm uit; dat scheelt het meeste stroom. Handmatig: `deploy/screen.sh off` / `on`.

## 3. Buiten huis (Tailscale Funnel)

```bash
sudo ./deploy/funnel.sh
```

Je krijgt een vaste link als `https://bosboom.<naam>.ts.net` die overal werkt, ook op 4G.
De eerste keer log je in bij Tailscale (gratis) en zet je Funnel aan via de link die het script toont.
Zet de link daarna in het beheerscherm bij Settings > Application URL.
Uitzetten: `sudo tailscale funnel --https=443 off`.

## Updaten

```bash
cd ~/Bosboombeheer && git pull && sudo ./deploy/install.sh
```

Nieuwe tabellen of velden komen in `pb_migrations/` en worden bij de herstart vanzelf toegepast.

## Back-ups

PocketBase maakt elke nacht om 03:00 een back-up in `/opt/bosboom/pb_data/backups`
en bewaart de laatste 7. Die staan op dezelfde SD-kaart: kopieer ze af en toe naar een
andere plek, of stel in het beheerscherm (Settings > Backups) S3-opslag in.
Terugzetten kan in hetzelfde scherm.

## Wachtwoord vergeten

Voor de resetmail heeft PocketBase een mailserver nodig (beheerscherm > Settings > Mail settings,
bv. een Gmail-app-wachtwoord) en het juiste adres van de app (Settings > Application URL).
Zonder mailserver: zet in het beheerscherm bij `users` zelf een nieuw wachtwoord.

## Handig

```bash
systemctl status bosboom          # draait hij?
journalctl -u bosboom -f          # meekijken in het logboek
sudo systemctl restart bosboom    # herstarten
```

## Testen (op je eigen computer)

```bash
node tests/rules.test.js
PB_BIN=/pad/naar/pocketbase node tests/pb.test.mjs   # start een echte PocketBase en test alle huisregels
```
