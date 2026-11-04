#!/usr/bin/env bash
# De Bosboom bereikbaar maken buiten huis, via Tailscale Funnel: een vaste https-link
# zoals https://bosboom.<jouw-tailnet>.ts.net. Gratis, geen eigen domein nodig.
# Draai op de Pi:   sudo ./deploy/funnel.sh
# Uitzetten:        sudo tailscale funnel --https=443 off
set -euo pipefail
[ "$(uname -s)" = Linux ] || { echo "Dit script is voor de Raspberry Pi. Log eerst in op de Pi (ssh) en draai het daar."; exit 1; }
[ "$(id -u)" = 0 ] || { echo "Draai dit met sudo."; exit 1; }

if ! command -v tailscale >/dev/null; then
  echo "==> Tailscale installeren"
  curl -fsSL https://tailscale.com/install.sh | sh
fi

echo "==> Inloggen bij Tailscale (open de link die verschijnt, log in met je eigen account)"
tailscale up --hostname=bosboom

echo "==> Funnel aanzetten naar de app (poort 8090)"
echo "    Vraagt Tailscale om Funnel/HTTPS eerst aan te zetten? Open die link, klik 'Enable', en wacht tot het verder gaat."
tailscale funnel --bg 8090

URL="$(tailscale funnel status 2>/dev/null | grep -om1 'https://[^ ]*' || true)"
echo
echo "Klaar. De app buiten huis: ${URL:-zie 'tailscale funnel status'}"
echo "Zet die link ook in PocketBase: http://localhost:8090/_/ > Settings > Application URL"
echo "(nodig voor de wachtwoord-resetlinks)."
