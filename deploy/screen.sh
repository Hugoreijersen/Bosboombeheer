#!/usr/bin/env bash
# Scherm aan of uit:   deploy/screen.sh on | off
# Probeert eerst de achtergrondverlichting (officieel Pi-touchscreen en de meeste DSI-schermen:
# zuinigst), dan Wayland (wlr-randr), dan X11 (xset).
set -u
want="${1:-}"; [ "$want" = on ] || [ "$want" = off ] || { echo "gebruik: $0 on|off"; exit 1; }

for bl in /sys/class/backlight/*/bl_power; do
  [ -w "$bl" ] || continue
  echo $([ "$want" = on ] && echo 0 || echo 1) > "$bl" && exit 0
done

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
if command -v wlr-randr >/dev/null; then
  export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-$(ls "$XDG_RUNTIME_DIR" 2>/dev/null | grep -m1 '^wayland-[0-9]*$')}"
  for out in $(wlr-randr 2>/dev/null | awk '/^[^ ]/{print $1}'); do wlr-randr --output "$out" --"$want"; done && exit 0
fi

if command -v xset >/dev/null; then
  export DISPLAY="${DISPLAY:-:0}"
  if [ "$want" = off ]; then xset dpms force off; else xset dpms force on; xset s reset; fi
  exit 0
fi
echo "Geen manier gevonden om het scherm te schakelen."; exit 1
