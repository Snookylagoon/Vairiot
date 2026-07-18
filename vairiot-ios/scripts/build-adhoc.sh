#!/usr/bin/env bash
# Builds an Ad Hoc-signed IPA for over-the-air distribution via the Vairiot admin panel.
#
#   ./scripts/build-adhoc.sh <versionName> <buildNumber> [--publish [releaseNotes]]
#
#   ./scripts/build-adhoc.sh 1.0.0 1
#   ./scripts/build-adhoc.sh 1.1.0 2 --publish "RFID improvements"
#
# --publish uploads the IPA to production (SSH alias "vairiot") and registers it
# as the current iOS release via scripts/upload-ios-release.cjs inside the
# vairiot_api container. Requires an Apple Distribution certificate — with
# cloud signing (-allowProvisioningUpdates) Xcode creates one automatically the
# first time. Newly enrolled device UDIDs must be added at
# https://developer.apple.com/account/resources/devices/list BEFORE building,
# so the Ad Hoc profile embeds them.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION_NAME="${1:?usage: build-adhoc.sh <versionName> <buildNumber> [--publish [releaseNotes]]}"
BUILD_NUMBER="${2:?usage: build-adhoc.sh <versionName> <buildNumber> [--publish [releaseNotes]]}"
PUBLISH="${3:-}"
RELEASE_NOTES="${4:-}"

ARCHIVE_PATH="build/VairiotMobile.xcarchive"
EXPORT_DIR="build/adhoc"

echo "==> Archiving Vairiot ${VERSION_NAME} (build ${BUILD_NUMBER})"
xcodebuild -project VairiotMobile.xcodeproj \
  -scheme VairiotMobile \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  MARKETING_VERSION="$VERSION_NAME" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  -allowProvisioningUpdates \
  archive | tail -3

echo "==> Exporting Ad Hoc IPA"
rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist ExportOptions.plist \
  -allowProvisioningUpdates | tail -3

IPA_PATH="$EXPORT_DIR/VairiotMobile.ipa"
[ -f "$IPA_PATH" ] || IPA_PATH="$(ls "$EXPORT_DIR"/*.ipa | head -1)"
echo "==> IPA ready: $IPA_PATH ($(du -h "$IPA_PATH" | cut -f1))"

if [ "$PUBLISH" = "--publish" ]; then
  echo "==> Publishing to production"
  scp "$IPA_PATH" vairiot:/tmp/vairiot-ios.ipa
  scp scripts/upload-ios-release.cjs vairiot:/tmp/upload-ios-release.cjs
  ssh vairiot "docker cp /tmp/vairiot-ios.ipa vairiot_api:/tmp/vairiot-ios.ipa \
    && docker cp /tmp/upload-ios-release.cjs vairiot_api:/tmp/upload-ios-release.cjs \
    && docker exec vairiot_api node /tmp/upload-ios-release.cjs /tmp/vairiot-ios.ipa $BUILD_NUMBER $VERSION_NAME '$RELEASE_NOTES' \
    && rm /tmp/vairiot-ios.ipa /tmp/upload-ios-release.cjs"
  echo "==> Published. Install page: https://vai.vairiot.com/api/v1/ios/install"
fi
