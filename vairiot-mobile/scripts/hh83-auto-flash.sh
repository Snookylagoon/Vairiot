#!/usr/bin/env bash
# hh83-auto-flash.sh — Channel B of the HH83 auto-update plan.
#
# Watches for any Nordic ID HH83 connecting over USB and, when one appears,
# installs the latest local debug APK if it differs from what was last flashed.
#
# Bash 3.2 compatible (stock macOS /bin/bash).
#
# Run continuously, either:
#   • foreground in a Terminal tab:   ./hh83-auto-flash.sh
#   • via the launchd agent installed by install-hh83-auto-flash.sh — but note
#     that launchd-spawned shells need Full Disk Access (System Settings →
#     Privacy & Security → Full Disk Access) to read scripts/APKs that live on
#     an external volume like /Volumes/DRSssd.

set -u
set -o pipefail

REPO="${REPO:-/Volumes/DRSssd/Projects/GitHub/Vairiot}"
APK="${APK:-$REPO/vairiot-mobile/app/build/outputs/apk/debug/Vairiot-Current.apk}"
ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
POLL_SECONDS="${POLL_SECONDS:-3}"
STATE_DIR="$REPO/.claude/hh83-auto-flash"
LOG="$STATE_DIR/auto-flash.log"

mkdir -p "$STATE_DIR"

log() {
  local line
  line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$line"
  echo "$line" >> "$LOG"
}

if [ ! -x "$ADB" ]; then
  log "ERROR: adb not found at $ADB. Set ADB= env var or install platform-tools."
  exit 1
fi

log "hh83-auto-flash started. Polling every ${POLL_SECONDS}s. Log: $LOG"

# SEEN is a newline-separated list of "<serial>:<outcome>" entries representing
# devices we've already evaluated in their current connection cycle. When a
# device disconnects, its entry is dropped so a reconnect re-triggers the check.
SEEN=""

while true; do
  if [ ! -f "$APK" ]; then
    sleep "$POLL_SECONDS"; continue
  fi

  apk_sha=$(shasum -a 256 "$APK" 2>/dev/null | cut -d' ' -f1)
  if [ -z "$apk_sha" ]; then
    sleep "$POLL_SECONDS"; continue
  fi

  # Snapshot currently-authorised devices.
  current_list=$("$ADB" devices 2>/dev/null | tail -n +2 | awk '$2=="device"{print $1}')

  # Drop SEEN entries for devices no longer connected.
  new_seen=""
  while IFS=: read -r seen_serial _seen_outcome; do
    [ -z "$seen_serial" ] && continue
    if printf '%s\n' "$current_list" | grep -qx "$seen_serial"; then
      # Still connected — keep the entry.
      new_seen="$new_seen$seen_serial:_seen_outcome
"
    else
      log "Device $seen_serial disconnected. Will re-check on next reconnect."
    fi
  done <<EOF
$SEEN
EOF
  SEEN="$new_seen"

  # Evaluate each currently-connected device.
  for serial in $current_list; do
    if printf '%s\n' "$SEEN" | grep -q "^$serial:"; then
      continue   # already evaluated in this connection cycle
    fi

    model=$("$ADB" -s "$serial" shell getprop ro.product.model 2>/dev/null | tr -d '\r\n')
    if [ "$model" != "HH83" ]; then
      SEEN="$SEEN$serial:skip
"
      continue
    fi

    last_flashed=""
    [ -f "$STATE_DIR/$serial.sha" ] && last_flashed=$(cat "$STATE_DIR/$serial.sha")

    if [ "$last_flashed" = "$apk_sha" ]; then
      log "HH83 $serial reconnected — already on the current APK (sha256=${apk_sha:0:12}…). No action."
      SEEN="$SEEN$serial:current
"
      continue
    fi

    log "HH83 $serial connected. Local APK ${apk_sha:0:12}… differs from last flash (${last_flashed:0:12}…). Installing…"
    if "$ADB" -s "$serial" install -r "$APK" >> "$LOG" 2>&1; then
      printf '%s' "$apk_sha" > "$STATE_DIR/$serial.sha"
      log "✓ Install OK on $serial. Marker updated."
      SEEN="$SEEN$serial:installed
"
    else
      log "✗ Install FAILED on $serial. If this is a signature mismatch, run:"
      log "    $ADB -s $serial uninstall com.vairiot.app"
      log "  …and the next reconnect will install cleanly. Use a release keystore"
      log "  (vairiot-mobile/scripts/gen-release-keystore.sh) to avoid this."
      SEEN="$SEEN$serial:failed
"
    fi
  done

  sleep "$POLL_SECONDS"
done
