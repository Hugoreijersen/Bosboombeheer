#!/usr/bin/env bash
# De Bosboom — installeren of bijwerken op de Raspberry Pi.
# Draai vanuit de map van deze repo:   sudo ./deploy/install.sh
# Daarna nog een keer draaien na elke `git pull` werkt ook: dan wordt alleen bijgewerkt.
set -euo pipefail

PB_VERSION="0.40.6"
declare -A PB_SHA256=(
  [arm64]="d22c66ceb67ca92b7d767f36d826e848a276bcfa3c197ead20bf87c42208984f"
  [armv7]="33f1145b80531df8ecca8f6d90387f6f661e1169e313689fbb070d5ee21621c0"
)
BASE=/opt/bosboom
REPO="$(cd "$(dirname "$0")/.." && pwd)"

[ "$(uname -s)" = Linux ] || { echo "Dit script is voor de Raspberry Pi. Log eerst in op de Pi (ssh) en draai het daar."; exit 1; }
[ "$(id -u)" = 0 ] || { echo "Draai dit met sudo."; exit 1; }

case "$(uname -m)" in
  aarch64|arm64) ARCH=arm64 ;;
  armv7l|armv6l) ARCH=armv7 ;;
  *) echo "Onbekende processor: $(uname -m)"; exit 1 ;;
esac

echo "==> Tijdzone Europe/Amsterdam (voor 'vandaag' in de app)"
timedatectl set-timezone Europe/Amsterdam || true

echo "==> Gebruiker en mappen"
id bosboom >/dev/null 2>&1 || useradd --system --home "$BASE" --shell /usr/sbin/nologin bosboom
mkdir -p "$BASE/pb_data" "$BASE/app" "$BASE/public"

if [ ! -x "$BASE/pocketbase" ] || ! "$BASE/pocketbase" --version | grep -q "$PB_VERSION"; then
  echo "==> PocketBase $PB_VERSION ($ARCH) downloaden"
  tmp="$(mktemp -d)"
  zip="pocketbase_${PB_VERSION}_linux_${ARCH}.zip"
  curl -fsSL -o "$tmp/$zip" "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${zip}"
  echo "${PB_SHA256[$ARCH]}  $tmp/$zip" | sha256sum -c -
  command -v unzip >/dev/null || apt-get install -y unzip
  unzip -o -q "$tmp/$zip" pocketbase -d "$tmp"
  install -m 755 "$tmp/pocketbase" "$BASE/pocketbase"
  rm -rf "$tmp"
fi

echo "==> App-bestanden kopiëren"
command -v rsync >/dev/null || apt-get install -y rsync
# Server-kant: hooks, migraties en de huisregels (pb_hooks laadt ../js/rules.js)
rsync -a --delete "$REPO/pb_hooks" "$REPO/pb_migrations" "$BASE/app/"
mkdir -p "$BASE/app/js" && cp "$REPO/js/rules.js" "$BASE/app/js/rules.js"
# Wat de browser te zien krijgt
rsync -a --delete --include='/index.html' --include='/manifest.webmanifest' --include='/*.png' \
  --include='/css/***' --include='/js/***' --exclude='*' "$REPO/" "$BASE/public/"
chown -R bosboom:bosboom "$BASE"

echo "==> Service"
install -m 644 "$REPO/deploy/bosboom.service" /etc/systemd/system/bosboom.service
systemctl daemon-reload
systemctl enable bosboom >/dev/null
systemctl restart bosboom
sleep 2
systemctl --no-pager --lines=0 status bosboom || true

echo "==> Automatisch bijwerken (elke 2 minuten kijken of er iets nieuws op main staat)"
cat > /etc/systemd/system/bosboom-update.service <<EOF
[Unit]
Description=De Bosboom bijwerken vanaf GitHub
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$REPO/deploy/autoupdate.sh
EOF
cat > /etc/systemd/system/bosboom-update.timer <<EOF
[Unit]
Description=De Bosboom elke 2 minuten bijwerken vanaf GitHub

[Timer]
OnBootSec=3min
OnUnitActiveSec=2min

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now bosboom-update.timer >/dev/null

# Is er al een beheerder? PocketBase heeft geen "superuser list", dus kijken we in de database.
# (__pbinstaller@example.com is een tijdelijke die PocketBase zelf maakt: die telt niet.)
has_admin(){
  python3 - "$BASE/pb_data/data.db" <<'PY' 2>/dev/null
import sqlite3, sys
db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
n = db.execute("select count(*) from _superusers where email not like '__pbinstaller%'").fetchone()[0]
sys.exit(0 if n else 1)
PY
}
if ! has_admin; then
  echo
  if [ -t 0 ]; then
    echo "==> Nog geen beheerder. Maak er een (alleen voor het beheerscherm, niet voor de app):"
    read -r -p "   E-mail: " ADMIN_EMAIL
    read -r -s -p "   Wachtwoord (min. 10 tekens): " ADMIN_PASS; echo
    sudo -u bosboom "$BASE/pocketbase" superuser upsert "$ADMIN_EMAIL" "$ADMIN_PASS" --dir="$BASE/pb_data"
  else
    # Automatisch bijwerken (geen toetsenbord): niet vragen en niet mislukken.
    echo "==> Nog geen beheerder gevonden. Draai zelf een keer: sudo ./deploy/install.sh"
  fi
fi

IP="$(hostname -I | awk '{print $1}')"
echo
echo "Klaar. De app:        http://$IP:8090/   (of http://$(hostname).local:8090/)"
echo "Beheer (PocketBase):  http://$IP:8090/_/"
