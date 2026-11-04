#!/usr/bin/env bash
# De Bosboom lokaal draaien om wijzigingen te bekijken vóór je pusht (Mac of Linux).
#     ./dev.sh            start op http://localhost:8090  (stoppen: Ctrl+C)
#     ./dev.sh --reset    begin opnieuw met een lege test-database
# Het gebruikt dezelfde PocketBase, migraties en hooks als de Pi, met een eigen test-database
# (niet die van de Pi). Wijzig je html/css/js, dan is herladen in de browser genoeg.
# Wijzig je pb_hooks of pb_migrations, stop dan met Ctrl+C en start opnieuw.
set -euo pipefail
cd "$(dirname "$0")"
PB_VERSION="0.40.6"
PORT="${PORT:-8090}"
DEV="${XDG_CACHE_HOME:-$HOME/.cache}/bosboom-dev"
ADMIN_EMAIL="admin@bosboom.local"; ADMIN_PASS="bosboom-dev"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  ARCH=darwin_arm64; SUM=7f2f7544e9ee5994ab69f84b22a4ab9a3bcfed58c1dad7206d05ebeb753f968b ;;
  Darwin-x86_64) ARCH=darwin_amd64; SUM=970464cfdb8faf0ad57e0b6b806fd85e81f99cb78000a1c9f78cdcb1b36d4b7a ;;
  Linux-x86_64)  ARCH=linux_amd64;  SUM=0e1f609158ed945f809f8a02ae012aa0427129c66ebb63c1aee76f2c0309373f ;;
  Linux-aarch64) ARCH=linux_arm64;  SUM=d22c66ceb67ca92b7d767f36d826e848a276bcfa3c197ead20bf87c42208984f ;;
  Linux-armv7l)  ARCH=linux_armv7;  SUM=33f1145b80531df8ecca8f6d90387f6f661e1169e313689fbb070d5ee21621c0 ;;
  *) echo "Onbekend systeem: $(uname -s) $(uname -m)"; exit 1 ;;
esac

PB="$DEV/pocketbase"
mkdir -p "$DEV"
if [ ! -x "$PB" ] || ! "$PB" --version 2>/dev/null | grep -q "$PB_VERSION"; then
  echo "==> PocketBase $PB_VERSION downloaden (eenmalig)"
  tmp="$(mktemp -d)"; zip="pocketbase_${PB_VERSION}_${ARCH}.zip"
  curl -fsSL -o "$tmp/$zip" "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${zip}"
  got="$( (command -v sha256sum >/dev/null && sha256sum "$tmp/$zip" || shasum -a 256 "$tmp/$zip") | awk '{print $1}')"
  [ "$got" = "$SUM" ] || { echo "Checksum klopt niet, gestopt."; rm -rf "$tmp"; exit 1; }
  unzip -o -q "$tmp/$zip" pocketbase -d "$tmp"
  mv "$tmp/pocketbase" "$PB"; chmod +x "$PB"; rm -rf "$tmp"
fi

[ "${1:-}" = "--reset" ] && { echo "==> Test-database leeggemaakt"; rm -rf "$DEV/pb_data"; }

DIRS=(--dir="$DEV/pb_data" --hooksDir="$PWD/pb_hooks" --migrationsDir="$PWD/pb_migrations")
"$PB" superuser upsert "$ADMIN_EMAIL" "$ADMIN_PASS" "${DIRS[@]}" >/dev/null

cat <<INFO

  De app:         http://localhost:$PORT/
  Als kiosk:      http://localhost:$PORT/?kiosk=1   (terug: ?kiosk=0)
                  Tip: in Chrome F12 > apparaatknop, 480 x 800, dan zie je het staande scherm.
  Beheerscherm:   http://localhost:$PORT/_/   ($ADMIN_EMAIL / $ADMIN_PASS, alleen lokaal)

  Maak in de app een account en claim een boom, net als op de Pi.
  Stoppen: Ctrl+C

INFO
exec "$PB" serve --http="127.0.0.1:$PORT" --publicDir="$PWD" "${DIRS[@]}"
