#!/usr/bin/env bash
# install-hh83-auto-flash.sh — installs the launchd agent that runs
# hh83-auto-flash.sh continuously, so any HH83 plugged into this Mac
# gets the latest local debug APK without a manual install command.
#
# Run once. To uninstall: pass --uninstall.

set -euo pipefail

LABEL="com.vairiot.hh83-auto-flash"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST_SRC="$REPO/vairiot-mobile/launchd/$LABEL.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"

uninstall() {
  launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
  rm -f "$PLIST_DST"
  echo "✅ Uninstalled $LABEL."
}

if [[ "${1:-}" = "--uninstall" ]]; then
  uninstall
  exit 0
fi

if [[ ! -f "$PLIST_SRC" ]]; then
  echo "❌ Plist template not found at $PLIST_SRC" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
sed "s|__REPO_PATH__|$REPO|g" "$PLIST_SRC" > "$PLIST_DST"

# Reload if already loaded.
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST_DST"

echo "✅ $LABEL installed."
echo "   Watching: $REPO/vairiot-mobile/app/build/outputs/apk/debug/app-debug.apk"
echo "   Stdout:   /tmp/hh83-auto-flash.out.log"
echo "   Stderr:   /tmp/hh83-auto-flash.err.log"
echo "   State:    $REPO/.claude/hh83-auto-flash/"
echo

# If the repo lives on an external volume, launchd's spawned bash will be
# blocked by macOS TCC ("Operation not permitted") until /bin/bash has Full
# Disk Access. Detect and warn — the agent is still installed, just dormant.
case "$REPO" in
  /Volumes/*)
    sleep 3
    if grep -q "Operation not permitted" /tmp/hh83-auto-flash.err.log 2>/dev/null; then
      echo "⚠️  TCC is blocking the agent because the repo is on $REPO."
      echo "   To fix once: System Settings → Privacy & Security → Full Disk Access,"
      echo "   click +, press ⌘⇧G, paste /bin/bash, and tick the resulting entry."
      echo "   Then run: launchctl kickstart -k gui/$UID_NUM/$LABEL"
      echo
      echo "   Alternative (no FDA): run the watcher manually in Terminal whenever you need it:"
      echo "     $REPO/vairiot-mobile/scripts/hh83-auto-flash.sh"
      exit 0
    fi
    ;;
esac

echo "Plug in the HH83 and the latest APK installs automatically within a few seconds."
echo "To uninstall later:  $0 --uninstall"
