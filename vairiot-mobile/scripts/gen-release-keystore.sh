#!/usr/bin/env bash
# Generates a release-signing keystore for the Vairiot Android app.
# Run ONCE. After that, every release APK is signed with the same key, so
# OTA upgrades install cleanly over previous installs.
#
# Outputs:
#   app/vairiot-release.jks       — the keystore (gitignored)
#   app/keystore.properties       — credentials gradle reads at build time (gitignored)
#
# After running this, future builds: ./gradlew assembleRelease
set -euo pipefail

cd "$(dirname "$0")/.."

KEYSTORE_PATH="app/vairiot-release.jks"
PROPS_PATH="app/keystore.properties"

if [[ -f "$KEYSTORE_PATH" ]]; then
  echo "❌  $KEYSTORE_PATH already exists. Refusing to overwrite — losing this keystore breaks future OTA upgrades."
  exit 1
fi

read -rsp "Enter a strong keystore password: " STORE_PW; echo
read -rsp "Confirm keystore password: " STORE_PW2; echo
[[ "$STORE_PW" = "$STORE_PW2" ]] || { echo "Passwords don't match"; exit 1; }

KEYTOOL="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}/bin/keytool"
[[ -x "$KEYTOOL" ]] || KEYTOOL="$(command -v keytool)"

"$KEYTOOL" -genkeypair \
  -keystore "$KEYSTORE_PATH" \
  -alias vairiot-release \
  -keyalg RSA -keysize 2048 \
  -validity 10950 \
  -storepass "$STORE_PW" \
  -keypass "$STORE_PW" \
  -dname "CN=Vairiot, OU=Mobile, O=Vairiot, L=Unknown, S=Unknown, C=GB"

cat > "$PROPS_PATH" <<EOF
storeFile=app/vairiot-release.jks
storePassword=$STORE_PW
keyAlias=vairiot-release
keyPassword=$STORE_PW
EOF

chmod 600 "$PROPS_PATH" "$KEYSTORE_PATH"

echo
echo "✅  Generated $KEYSTORE_PATH (valid 30 years)"
echo "✅  Wrote $PROPS_PATH"
echo
echo "BACK THIS UP. If you lose vairiot-release.jks you can never publish an"
echo "OTA upgrade over the current install base — devices will refuse to update"
echo "to an APK signed with a different key."
