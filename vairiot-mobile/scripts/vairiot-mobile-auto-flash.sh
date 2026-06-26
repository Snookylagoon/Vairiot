#!/usr/bin/env bash
# vairiot-mobile-auto-flash.sh — Channel B of the field-device auto-update plan.
#
# Watches for any supported field device (Nordic ID HH83, ME65; configurable via
# MODELS=) connecting over USB and, when one appears, installs the latest local
# release APK if it differs from what was last flashed.
#
# Bash 3.2 compatible (stock macOS /bin/bash).
#
# Run continuously, either:
#   • foreground in a Terminal tab:   ./vairiot-mobile-auto-flash.sh
#   • via the launchd agent installed by install-vairiot-mobile-auto-flash.sh — but note
#     that launchd-spawned shells need Full Disk Access (System Settings →
#     Privacy & Security → Full Disk Access) to read scripts/APKs that live on
#     an external volume like /Volumes/DRSssd.

set -u
set -o pipefail

REPO="${REPO:-/Volumes/DRSssd/Projects/GitHub/Vairiot}"
# Field devices must run the RELEASE-signed build so they can also receive
# over-the-air updates: an OTA APK signed with the release keystore cannot
# update a debug-signed install (Android reports "App not installed"). Override
# with APK=…/apk/debug/Vairiot-Current.apk only for throwaway dev handsets.
APK="${APK:-$REPO/vairiot-mobile/app/build/outputs/apk/release/Vairiot-Current.apk}"
ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
# Device models to auto-flash, space-separated, matched exactly against
# ro.product.model. Override to add/restrict, e.g. MODELS="HH83".
MODELS="${MODELS:-HH83 ME65}"
POLL_SECONDS="${POLL_SECONDS:-3}"
STATE_DIR="$REPO/.claude/vairiot-mobile-auto-flash"
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

log "vairiot-mobile-auto-flash started. Models: [$MODELS]. Polling every ${POLL_SECONDS}s. Log: $LOG"

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
    matched=""
    for m in $MODELS; do
      [ "$model" = "$m" ] && { matched="yes"; break; }
    done
    if [ -z "$matched" ]; then
      # Log once per connection so an unexpected model string (e.g. ME65 not
      # reporting exactly "ME65") is visible rather than silently ignored.
      log "Skipping $serial — model '$model' not in [$MODELS]. Set MODELS= to include it."
      SEEN="$SEEN$serial:skip
"
      continue
    fi

    last_flashed=""
    [ -f "$STATE_DIR/$serial.sha" ] && last_flashed=$(cat "$STATE_DIR/$serial.sha")

    if [ "$last_flashed" = "$apk_sha" ]; then
      log "$model $serial reconnected — already on the current APK (sha256=${apk_sha:0:12}…). No action."
      SEEN="$SEEN$serial:current
"
      continue
    fi

    log "$model $serial connected. Local APK ${apk_sha:0:12}… differs from last flash (${last_flashed:0:12}…). Installing…"
    install_out=$("$ADB" -s "$serial" install -r "$APK" 2>&1)
    echo "$install_out" >> "$LOG"
    if printf '%s' "$install_out" | grep -q "Success"; then
      printf '%s' "$apk_sha" > "$STATE_DIR/$serial.sha"
      log "✓ Install OK on $serial. Marker updated."
      SEEN="$SEEN$serial:installed
"
    elif printf '%s' "$install_out" | grep -qiE "INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match|INSTALL_FAILED_VERSION_DOWNGRADE"; then
      # Signing key (or version) changed — e.g. an old debug-signed build is on
      # the device and we are now flashing the release build. Clear it and retry
      # once. This wipes local app data, which is safe here: the app force
      # re-logins on launch and syncs scans from the server.
      log "⚠ Signature/version conflict on $serial — uninstalling old build and retrying…"
      "$ADB" -s "$serial" uninstall com.vairiot.app >> "$LOG" 2>&1
      if "$ADB" -s "$serial" install "$APK" >> "$LOG" 2>&1; then
        printf '%s' "$apk_sha" > "$STATE_DIR/$serial.sha"
        log "✓ Clean reinstall OK on $serial. Marker updated."
        SEEN="$SEEN$serial:installed
"
      else
        log "✗ Reinstall FAILED on $serial after uninstall. Check the device manually."
        SEEN="$SEEN$serial:failed
"
      fi
    else
      log "✗ Install FAILED on $serial (not a signature conflict). See log above."
      SEEN="$SEEN$serial:failed
"
    fi
  done

  sleep "$POLL_SECONDS"
done
