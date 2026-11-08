#!/usr/bin/env bash
# De Bosboom — automatisch bijwerken na elke merge op GitHub.
# Draait elke 2 minuten via de timer bosboom-update (die zet install.sh aan).
# Is er iets nieuws op main, dan: git pull, install.sh, en de kiosk-browser herladen.
# Zelf draaien kan ook:   sudo ./deploy/autoupdate.sh
# Logboek:                journalctl -u bosboom-update
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
OWNER="$(stat -c %U "$REPO")"   # de gebruiker van de repo (bosboombeheer): git draait als die
[ "$(id -u)" = 0 ] || { echo "Draai dit met sudo."; exit 1; }
as_owner(){ runuser -u "$OWNER" -- "$@"; }
git_(){ as_owner git -C "$REPO" "$@"; }

branch="$(git_ rev-parse --abbrev-ref HEAD)"
if [ "$branch" != main ]; then echo "Op branch '$branch', niet main: niets bijgewerkt."; exit 0; fi
if [ -n "$(git_ status --porcelain --untracked-files=no)" ]; then
  echo "Er zijn lokale wijzigingen in $REPO: niets bijgewerkt. Zet ze terug met 'git checkout .'."; exit 0
fi

git_ fetch -q origin main
old="$(git_ rev-parse HEAD)"; new="$(git_ rev-parse origin/main)"
[ "$old" != "$new" ] || exit 0

echo "Nieuw op main: $(git_ log --oneline "$old..$new" | wc -l) commit(s), tot $(git_ log -1 --format='%h %s' "$new")"
git_ merge -q --ff-only origin/main
"$REPO/deploy/install.sh" </dev/null

# De kiosk laadt de nieuwe versie pas na herladen: sluit de browser, de kiosk-lus start hem opnieuw.
pkill -u "$OWNER" -f -- '--user-data-dir=.*bosboom-kiosk' && echo "Kiosk herladen." || true

if git_ diff --quiet "$old" "$new" -- deploy/kiosk.sh deploy/rotate.sh; then :; else
  echo "LET OP: deploy/kiosk.sh of rotate.sh is veranderd. Draai op de Pi nog: ./deploy/kiosk.sh (zonder sudo)."
fi
echo "Bijgewerkt naar $(git_ rev-parse --short HEAD)."
