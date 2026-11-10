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
Log op het touchscreen in met het **huisaccount** (een eigen e-mailadres, en bij de keuze
"Huisaccount" in plaats van een boom), zodat het scherm van niemand persoonlijk is.

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

## 4. Op je eigen domein (berkeikiep.nl, Cloudflare Tunnel)

In plaats van (of naast) de Funnel-link. De Pi maakt zelf verbinding met Cloudflare, dus geen
poorten in de router. Eenmalig in het Cloudflare-dashboard:

1. **Workers & Pages > bosboombeheer > Settings > Domains & Routes**: haal `berkeikiep.nl` weg
   (daar stond de oude versie zonder database).
2. **Zero Trust > Networks > Tunnels > Create a tunnel** (Cloudflared), naam `bosboom`.
   Kopieer de token uit het voorbeeldcommando.
3. **Public hostname**: `berkeikiep.nl`, service **HTTP**, URL `localhost:8090`.

Dan op de Pi:

```bash
sudo ./deploy/tunnel.sh <token>
```

Zet daarna `https://berkeikiep.nl` in het beheerscherm bij Settings > Application URL.
De token is geheim: niet in de repo of een chat zetten.

## Updaten

Dat gaat vanzelf: elke 2 minuten kijkt de Pi of er iets nieuws op `main` staat. Zo ja, dan
haalt hij het op, draait `install.sh` en herlaadt de kiosk. Een merge op GitHub staat dus
binnen een paar minuten live, ook op berkeikiep.nl. Dit zet `install.sh` aan (de timer
`bosboom-update`), dus na de eerste keer hoef je niets meer te doen.

```bash
journalctl -u bosboom-update -n 20             # wat deed hij de laatste keren?
sudo ./deploy/autoupdate.sh                    # nu meteen bijwerken
sudo systemctl disable --now bosboom-update.timer   # automatisch bijwerken uitzetten
```

Hij werkt niet bij als de repo op de Pi lokale wijzigingen heeft of niet op `main` staat;
dat staat dan in het logboek. Is `deploy/kiosk.sh` veranderd, draai dan zelf nog `./deploy/kiosk.sh`.

Nieuwe tabellen of velden komen in `pb_migrations/` en worden bij de herstart vanzelf toegepast.

## Back-ups

PocketBase maakt elke nacht om 03:00 een back-up (een zip van alle data: DeeldeDuit, agenda, alles)
en bewaart de laatste 30 in `/opt/bosboom/pb_data/backups`. Die staan op dezelfde SD-kaart als de app:
ze helpen bij een vergissing, niet als de kaart of de Pi kapotgaat.
Download daarom af en toe een back-up: beheerscherm (`https://berkeikiep.nl/_/`) > Settings > Backups >
downloadknop. Terugzetten kan in hetzelfde scherm (*Restore*).

Back-ups automatisch buiten de Pi bewaren is uitgezocht maar nog niet ingesteld:
zie `docs/later/backups-buiten-de-pi.md`.

Wil je de betalingen zelf bekijken of bewaren: DeeldeDuit > onderaan **Alles downloaden (CSV)**
(op je telefoon, niet op de kiosk) geeft elke uitgave met wie meededen en wanneer afgerekend.

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
