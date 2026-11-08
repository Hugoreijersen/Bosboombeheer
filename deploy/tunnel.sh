#!/usr/bin/env bash
# De Bosboom op je eigen domein (berkeikiep.nl) via een Cloudflare Tunnel.
# De Pi legt zelf een uitgaande verbinding met Cloudflare: geen poorten openzetten in de router.
#
# Eenmalig in Cloudflare (dash.cloudflare.com):
#   1. Workers & Pages > bosboombeheer > Settings > Domains & Routes: haal berkeikiep.nl weg
#      (anders zit de oude Worker nog op dat adres).
#   2. Zero Trust > Networks > Tunnels > Create a tunnel > Cloudflared, naam "bosboom".
#      Kopieer de token (de lange tekst na "--token" in het voorbeeldcommando).
#   3. Public hostname: berkeikiep.nl, Service: HTTP, URL: localhost:8090. Opslaan.
# Dan op de Pi:
#     sudo ./deploy/tunnel.sh <token>
# De token is geheim: zet hem nergens anders neer (niet in de repo).
set -euo pipefail
[ "$(uname -s)" = Linux ] || { echo "Dit script is voor de Raspberry Pi."; exit 1; }
[ "$(id -u)" = 0 ] || { echo "Draai dit met sudo."; exit 1; }
TOKEN="${1:-}"
[ -n "$TOKEN" ] || { echo "Gebruik: sudo ./deploy/tunnel.sh <token uit het Cloudflare-dashboard>"; exit 1; }

if ! command -v cloudflared >/dev/null; then
  echo "==> cloudflared installeren"
  mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
    > /etc/apt/sources.list.d/cloudflared.list
  apt-get update && apt-get install -y cloudflared
fi

echo "==> Tunnel als service (start vanzelf na een herstart)"
cloudflared service uninstall >/dev/null 2>&1 || true
cloudflared service install "$TOKEN"
systemctl enable --now cloudflared >/dev/null
sleep 3
systemctl --no-pager --lines=5 status cloudflared || true

echo
echo "Klaar. Over een minuut: https://berkeikiep.nl"
echo "Zet dat adres ook in PocketBase: http://localhost:8090/_/ > Settings > Application URL"
echo "(nodig voor de wachtwoord-resetlinks)."
echo "Tailscale Funnel mag dan uit: sudo tailscale funnel --https=443 off  (SSH via Tailscale blijft werken)"
