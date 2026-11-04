#!/usr/bin/env bash
# De Bosboom — de Pi laten opstarten in de app, schermvullend (kiosk).
# Draai als de gewone gebruiker die op het bureaublad inlogt (dus ZONDER sudo):
#     ./deploy/kiosk.sh            (scherm uit 01:00, aan 06:30)
#     ./deploy/kiosk.sh 23:30 07:00
# Werkt met Raspberry Pi OS met bureaublad (Wayland/labwc of X11), automatisch inloggen aan.
set -euo pipefail
OFF="${1:-01:00}"; ON="${2:-06:30}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
URL="http://localhost:8090/?kiosk=1"
HEALTH="http://localhost:8090/api/health"

[ "$(uname -s)" = Linux ] || { echo "Dit script is voor de Raspberry Pi. Log eerst in op de Pi (ssh) en draai het daar."; exit 1; }
[ "$(id -u)" != 0 ] || { echo "Draai dit zonder sudo, als de gebruiker van het bureaublad."; exit 1; }

BROWSER="$(command -v chromium || command -v chromium-browser || true)"
if [ -z "$BROWSER" ]; then sudo apt-get install -y chromium || sudo apt-get install -y chromium-browser; BROWSER="$(command -v chromium || command -v chromium-browser)"; fi

# Zuinig en zonder pop-ups. Geen vertaal-balk, geen "herstel pagina's", niet terug-swipen.
FLAGS="--kiosk --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble \
--disable-features=Translate,TranslateUI --overscroll-history-navigation=0 --disable-pinch \
--check-for-update-interval=31536000 --password-store=basic \
--enable-wayland-ime --wayland-text-input-version=3"
# (die laatste twee: het schermtoetsenbord komt vanzelf op als je in een tekstveld tikt)

mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/bosboom-kiosk" <<EOF
#!/usr/bin/env bash
# Wacht tot de app er is, start dan de browser (en opnieuw als hij crasht).
# Altijd maar één kiosk tegelijk.
exec 9>"\${XDG_RUNTIME_DIR:-/tmp}/bosboom-kiosk.lock"
flock -n 9 || { echo "De kiosk draait al."; exit 0; }
until curl -fs $HEALTH >/dev/null; do sleep 2; done
# Eigen browserprofiel: zo is dit een aparte Chromium. Anders geeft hij de link door aan een
# Chromium die al openstaat, stopt meteen, en laadt de pagina elke paar seconden opnieuw.
PROFILE="\$HOME/.config/bosboom-kiosk"
# Wayland (labwc) of X11? Ook goed als je dit via ssh start.
export XDG_RUNTIME_DIR="\${XDG_RUNTIME_DIR:-/run/user/\$(id -u)}"
[ -n "\${WAYLAND_DISPLAY:-}" ] || WAYLAND_DISPLAY="\$(ls "\$XDG_RUNTIME_DIR" 2>/dev/null | grep -m1 '^wayland-[0-9]*\$')"
if [ -n "\$WAYLAND_DISPLAY" ]; then export WAYLAND_DISPLAY; PLATFORM=--ozone-platform=wayland
else export DISPLAY="\${DISPLAY:-:0}"; PLATFORM=--ozone-platform=x11; fi
LOG="\$HOME/.cache/bosboom-kiosk.log"; mkdir -p "\$(dirname "\$LOG")"
while true; do
  start=\$(date +%s)
  echo "\$(date '+%F %T') start (\$PLATFORM)" >> "\$LOG"
  "$BROWSER" $FLAGS \$PLATFORM --user-data-dir="\$PROFILE" "$URL" >> "\$LOG" 2>&1
  tail -n 500 "\$LOG" > "\$LOG.tmp" && mv "\$LOG.tmp" "\$LOG"
  # Stopte hij binnen 10 seconden? Niet blijven herstarten, eerst even wachten.
  if [ \$(( \$(date +%s) - start )) -lt 10 ]; then sleep 30; else sleep 3; fi
done
EOF
chmod +x "$HOME/.local/bin/bosboom-kiosk"

# Automatisch starten: labwc (Wayland, nieuwere Pi OS) of LXDE (X11, oudere Pi OS)
if [ -d /etc/xdg/labwc ] || command -v labwc >/dev/null; then
  mkdir -p "$HOME/.config/labwc"
  touch "$HOME/.config/labwc/autostart"
  grep -q bosboom-kiosk "$HOME/.config/labwc/autostart" || echo "$HOME/.local/bin/bosboom-kiosk &" >> "$HOME/.config/labwc/autostart"
  echo "Autostart: labwc"
  # Schermtoetsenbord (squeekboard): verschijnt bij een tekstveld, verdwijnt daarna weer
  command -v squeekboard >/dev/null || sudo apt-get install -y squeekboard
  grep -q '^squeekboard' "$HOME/.config/labwc/autostart" || sed -i '1i squeekboard &' "$HOME/.config/labwc/autostart"
  gsettings set org.gnome.desktop.a11y.applications screen-keyboard-enabled true 2>/dev/null || true
  echo "Schermtoetsenbord: squeekboard"
else
  mkdir -p "$HOME/.config/autostart"
  cat > "$HOME/.config/autostart/bosboom-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Bosboom kiosk
Exec=$HOME/.local/bin/bosboom-kiosk
X-GNOME-Autostart-enabled=true
EOF
  # scherm niet vanzelf op zwart (dat doen we zelf 's nachts)
  command -v xset >/dev/null && DISPLAY=:0 xset s off -dpms 2>/dev/null || true
  echo "Autostart: X11"
fi

# Achtergrondverlichting mag door deze gebruiker geschakeld worden (DSI-touchscreen)
if ls /sys/class/backlight/*/bl_power >/dev/null 2>&1; then
  echo 'SUBSYSTEM=="backlight", RUN+="/bin/chmod 0666 /sys/class/backlight/%k/bl_power"' | sudo tee /etc/udev/rules.d/90-bosboom-backlight.rules >/dev/null
  sudo udevadm trigger --subsystem-match=backlight || true
fi

# 's Nachts scherm uit (scheelt het meeste stroom), 's ochtends weer aan
cron_line() { local hm="$1" what="$2"; echo "${hm#*:} ${hm%%:*} * * * $REPO/deploy/screen.sh $what # bosboom"; }
( crontab -l 2>/dev/null | grep -v '# bosboom' || true; cron_line "$OFF" off; cron_line "$ON" on ) | crontab -
echo "Scherm uit om $OFF, aan om $ON."

echo "Klaar. Zet in raspi-config 'Boot / Auto Login' aan het bureaublad en herstart: sudo reboot"
