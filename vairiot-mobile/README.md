# vairiot-mobile (Android)

| Item     | Detail                                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package  | `vairiot-mobile` — Android field app (`com.vairiot.app`)                                                                                                       |
| Stack    | Kotlin 2.2, Jetpack Compose, Hilt, Room, WorkManager, Retrofit, CameraX, NordicID NUR SDK                                                                      |
| Devices  | Meferi ME61, ME65, ME74 (Android 13); min SDK 29, target 36                                                                                                    |
| Revision | 0.1 (16 October 2026)                                                                                                                                          |
| See also | [Technology stack](../docs/01-technology-stack.md) · [Architecture §4.5](../docs/00-discovery-and-architecture.md) · [Test plan](../docs/testing/test-plan.md) |

The app scans barcodes and UHF RFID tags, creates and edits assets, runs audits and blind audits, takes photos and GPS positions, and prints labels. Work done offline is queued in Room and synced by WorkManager.

## Layout

| Path (under `app/src/main/java/com/vairiot/app/`) | Contents                                                      |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `data/`, `data/local/`, `data/api/`               | Repositories, Room entities and DAOs, Retrofit API and models |
| `sync/`                                           | Queue drainer, sync workers, failure classification           |
| `scanner/`                                        | Camera, Meferi and NordicID RFID scanner services             |
| `location/`                                       | GPS capture                                                   |
| `label/`                                          | Bluetooth label printing                                      |
| `update/`                                         | Over-the-air updater                                          |
| `ui/`                                             | Compose screens and view models                               |
| `app/libs/`                                       | NordicID NUR SDK files (see `app/libs/README.md`)             |

## Set up

- Android Studio with JDK 21 (CI uses Temurin 21); the Gradle wrapper (8.14) downloads everything else.
- The NUR SDK files must be in `app/libs/` (`NurApi.jar`, `NurApiAndroid.aar`, `TDTLib.jar`).
- Release signing reads `app/keystore.properties` (not committed). Without it, release builds fall back to debug signing and **over-the-air upgrades fail** on installed devices. Use the canonical keystore, or create one once with `scripts/gen-release-keystore.sh`.

## Build and run

Run from `vairiot-mobile/`.

| Variant | Command                     | Server baked in             | Installs as                                                      |
| ------- | --------------------------- | --------------------------- | ---------------------------------------------------------------- |
| Debug   | `./gradlew assembleDebug`   | `https://vai.vairiot.com/`  | `com.vairiot.app`                                                |
| Staging | `./gradlew assembleStaging` | `https://test.vairiot.com/` | `com.vairiot.app.staging` ("Vairiot Staging"), beside production |
| Release | `./gradlew assembleRelease` | `https://vai.vairiot.com/`  | `com.vairiot.app`                                                |

Every variant writes `app/build/outputs/apk/<variant>/Vairiot-Mobile.apk`. For a local API on a USB device, change `API_BASE_URL` in `app/build.gradle.kts` to `http://localhost:3001/` and run `adb reverse tcp:3001 tcp:3001` (emulator: `http://10.0.2.2:3001/`). Do not commit that change.

## Test

| Task               | Command                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| Unit tests         | `./gradlew testDebugUnitTest`                                                  |
| Lint               | `./gradlew lintDebug`                                                          |
| Instrumented tests | `./gradlew connectedDebugAndroidTest` (device attached; one example test only) |

Unit suites cover the sync queue, failure classification, delta sync, GPS capture, GS1 and the RFID session classifier (62 tests at S0 close). CI runs lint and `assembleDebug` but **not** the unit tests yet (W3).

## Release

- Bump `versionCode` and `versionName` in `app/build.gradle.kts` (`versionCode` never goes down and is shared by every channel). From decision D3 the version moves in lockstep with the rest of the product.
- Staging: upload the staging APK through `testadmin.vairiot.com` → Mobile Releases.
- Production: copy the release APK to the server and run `scripts/upload-mobile-release.cjs` inside the `vairiot_api` container.
- Every Room schema change needs an explicit migration; destructive fallback is not allowed (S0.2).

## Known limits

- Tokens are in DataStore without encryption, and `allowBackup="true"` (SEC-L3).
- The server address is compiled in (SAAS-7); a standalone TUDA server needs a build flavour or a runtime picker.
- Files over 500 lines: `ScanSessionScreen.kt`, `AuditRunScreen.kt`, `ApiModels.kt`, `MaintenanceListScreen.kt`, `AuditListScreen.kt` (W3).
