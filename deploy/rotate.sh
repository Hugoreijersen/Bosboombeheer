#!/usr/bin/env bash
# Scherm (en touch) draaien op de Pi met labwc (Wayland). Blijft na een herstart.
#     ./deploy/rotate.sh 90      # kwartslag met de klok mee (staand)
#     ./deploy/rotate.sh 270     # kwartslag tegen de klok in
#     ./deploy/rotate.sh 0       # terug naar normaal
# Draai als de gewone gebruiker van het bureaublad (zonder sudo).
set -euo pipefail
[ "$(uname -s)" = Linux ] || { echo "Dit script is voor de Raspberry Pi. Log eerst in op de Pi (ssh) en draai het daar."; exit 1; }
[ "$(id -u)" != 0 ] || { echo "Draai dit zonder sudo, als de gebruiker van het bureaublad."; exit 1; }
case "${1:-}" in 0) T=normal ;; 90|180|270) T="$1" ;; *) echo "gebruik: $0 0|90|180|270"; exit 1 ;; esac

# Welk scherm? (het eerste dat aangesloten is, bv. HDMI-A-1)
OUT=""
for f in /sys/class/drm/card*-*/status; do
  [ "$(cat "$f")" = connected ] || continue
  n="$(basename "$(dirname "$f")")"; OUT="${n#card*-}"; break
done
[ -n "$OUT" ] || { echo "Geen aangesloten scherm gevonden."; exit 1; }
MODE="$(head -1 "/sys/class/drm/card"*"-$OUT/modes" 2>/dev/null || true)"
echo "Scherm: $OUT ${MODE:+($MODE)} -> draaien: $T"

# 1. Blijvend: kanshi (wat Raspberry Pi OS zelf gebruikt voor schermen)
mkdir -p "$HOME/.config/kanshi"
K="$HOME/.config/kanshi/config"
[ -f "$K" ] && [ ! -f "$K.voor-bosboom" ] && cp "$K" "$K.voor-bosboom"
cat > "$K" <<EOF
profile {
	output $OUT enable ${MODE:+mode $MODE }transform $T
}
EOF

# 2. Touch meedraaien: koppel elk touchscreen aan dit scherm (labwc rc.xml)
RC="$HOME/.config/labwc/rc.xml"
mkdir -p "$(dirname "$RC")"
[ -f "$RC" ] || printf '<?xml version="1.0"?>\n<labwc_config>\n</labwc_config>\n' > "$RC"
[ -f "$RC.voor-bosboom" ] || cp "$RC" "$RC.voor-bosboom"
sed -i '/<touch .*bosboom/d' "$RC"   # oude regels van dit script weg
# Alle invoer met absolute coördinaten (= touchscreens), behalve muizen/joysticks
mapfile -t TOUCH < <(awk -F'"' '/^N: Name=/{name=$2} /^B: ABS=/{ n=tolower(name); if (n !~ /mouse|accel|joystick|gamepad|pad$|hdmi|cec/) print name }' /proc/bus/input/devices | sort -u)
if [ "${#TOUCH[@]}" = 0 ]; then
  echo "Let op: geen touchscreen herkend. Zie 'cat /proc/bus/input/devices' en stuur de naam door."
else
  for d in "${TOUCH[@]}"; do
    # XML-veilig (& " < >) en daarna veilig voor sed
    esc="$(printf '%s' "$d" | sed -e 's/&/\&amp;/g' -e 's/"/\&quot;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' | sed 's/[&|\]/\\&/g')"
    sed -i "s|</labwc_config>|  <touch deviceName=\"$esc\" mapToOutput=\"$OUT\" /> <!-- bosboom -->\n</labwc_config>|" "$RC"
    echo "Touch gekoppeld: $d"
  done
fi

# 3. Meteen toepassen (als het bureaublad draait)
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-$(ls "$XDG_RUNTIME_DIR" 2>/dev/null | grep -m1 '^wayland-[0-9]*$' || true)}"
if [ -n "$WAYLAND_DISPLAY" ]; then
  if pgrep -x kanshi >/dev/null; then pkill -HUP -x kanshi || true
  elif command -v wlr-randr >/dev/null; then wlr-randr --output "$OUT" --transform "$T" || true; fi
  labwc --reconfigure 2>/dev/null || pkill -HUP -x labwc || true
fi
# Voor als kanshi niet automatisch start: bij het opstarten zelf draaien
AS="$HOME/.config/labwc/autostart"; touch "$AS"
sed -i '/# bosboom-rotate/d' "$AS"
# Bovenaan: eerst draaien, dan pas de kiosk starten (anders blijft Chromium wit)
LINE="wlr-randr --output $OUT --transform $T  # bosboom-rotate"
if [ -s "$AS" ]; then sed -i "1i $LINE" "$AS"; else echo "$LINE" > "$AS"; fi

echo "Klaar. Klopt de richting niet? Probeer de andere kant (90 <-> 270). Herstart om zeker te zijn: sudo reboot"
