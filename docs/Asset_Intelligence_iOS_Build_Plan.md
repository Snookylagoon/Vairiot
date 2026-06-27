# Asset Intelligence App — iOS Module Build Plan

**Project:** Asset Intelligence — iOS Camera Scanning Module
**Goal:** Build a lean iOS companion to the existing Android APK, using the device camera for barcode/2D code scanning, structured for cross-platform logic sharing so fixes and updates apply to both platforms.

---

## 1. Context Summary

The existing Android app:
- Scans barcodes and 2D codes (QR, Data Matrix, etc.) using the device camera
- Processes scan results against business logic (asset lookup, validation, API calls)
- Is packaged as a native Android APK

The iOS module must:
- Mirror the Android UI design and workflow closely
- Use the iPhone/iPad onboard camera via Apple's AVFoundation/Vision frameworks
- Share all business logic (processing, validation, API) with Android via a common layer
- Be structured so any logic fix applied to shared code updates both platforms automatically

---

## 2. Recommended Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Shared business logic | **Kotlin Multiplatform (KMP)** | Compiles common Kotlin code into a Swift-compatible framework for iOS |
| iOS UI | **SwiftUI** | Modern, lean, matches Apple design; easy to mirror Android layouts |
| iOS camera scanning | **AVFoundation + Vision** | Native Apple frameworks; no third-party SDK needed |
| Android UI | Existing (Kotlin + XML or Compose) | Unchanged |
| Android scanning | Existing (CameraX / ML Kit) | Unchanged |
| Networking | **Ktor** (in shared KMP module) | Cross-platform HTTP client, runs on both Android and iOS |
| Local data | **SQLDelight** (in shared KMP module) | Cross-platform SQLite ORM |
| Build system | **Gradle (KMP)** + **Xcode** | KMP produces an XCFramework consumed by the Xcode project |

---

## 3. Project Structure

```
AssetIntelligence/
├── shared/                          ← KMP shared module
│   └── src/
│       ├── commonMain/kotlin/
│       │   ├── models/
│       │   │   └── Asset.kt         ← Data models
│       │   ├── repository/
│       │   │   └── AssetRepository.kt  ← API + DB calls
│       │   ├── usecase/
│       │   │   └── LookupAssetUseCase.kt
│       │   └── scan/
│       │       ├── ScanResult.kt
│       │       ├── ScanProcessor.kt ← Validation logic
│       │       └── ScannerGateway.kt ← interface (expect/actual)
│       ├── androidMain/kotlin/
│       │   └── AndroidScannerGateway.kt  ← CameraX/MLKit impl
│       └── iosMain/kotlin/
│           └── IosScannerGateway.kt      ← bridges to Swift
│
├── androidApp/                      ← Existing Android app (refactored)
│   └── src/main/java/...
│
└── iosApp/                          ← NEW iOS Xcode project
    ├── AssetIntelligence.xcodeproj
    ├── App/
    │   ├── AppDelegate.swift
    │   ├── ContentView.swift
    │   └── Navigation/
    ├── Features/
    │   ├── Scanner/
    │   │   ├── ScannerView.swift        ← Camera UI
    │   │   ├── ScannerViewModel.swift
    │   │   └── AVFoundationScanner.swift ← Camera logic
    │   ├── AssetDetail/
    │   │   ├── AssetDetailView.swift
    │   │   └── AssetDetailViewModel.swift
    │   └── History/
    │       └── ScanHistoryView.swift
    ├── Shared/
    │   └── Components/              ← Reusable UI components
    └── Info.plist                   ← Camera permission entry
```

---

## 4. Key iOS Files to Build

### 4.1 `AVFoundationScanner.swift`
Wraps `AVCaptureSession` to detect barcodes and 2D codes in real time. Passes raw scan strings up to the ViewModel.

Supported code types: QR, PDF417, Code128, Code39, EAN-13, EAN-8, DataMatrix, Aztec.

### 4.2 `ScannerView.swift`
SwiftUI view with:
- Camera preview layer (UIViewRepresentable wrapping AVCaptureVideoPreviewLayer)
- Overlay with targeting reticle (matches Android scan UI)
- Torch/flash toggle button
- Cancel / manual-entry fallback

### 4.3 `ScannerViewModel.swift`
- Receives raw scan string from AVFoundationScanner
- Calls the shared KMP `LookupAssetUseCase` via the generated Swift framework
- Publishes result state: loading / found / not-found / error

### 4.4 `Info.plist` entry required
```xml
<key>NSCameraUsageDescription</key>
<string>Asset Intelligence needs the camera to scan barcodes and QR codes.</string>
```

---

## 5. Cross-Platform Update Strategy

The rule is simple:

- **Business logic change** (validation, API endpoint, data model) → edit in `shared/commonMain` → rebuild KMP framework → both Android and iOS automatically get the fix
- **Scan result processing change** → edit `ScanProcessor.kt` in shared → rebuilds for both
- **UI fix** → separate: fix in `androidApp` OR `iosApp` as needed
- **Camera fix** → separate: fix in platform-specific scanner gateway

To apply a shared update to iOS after editing the shared module:
```
# Run in terminal from project root:
./gradlew :shared:assembleXCFramework
# Then in Xcode, the framework updates automatically if linked correctly
```

---

## 6. Claude Build Script

Use the prompts below in sequence. Each is a self-contained instruction to Claude. Copy and paste each one when the previous step is complete.

---

### STEP 1 — Scaffold the KMP project

```
You are helping me build a Kotlin Multiplatform project for an Asset Intelligence app.

Create the full Gradle project scaffold with:
- A `shared` KMP module targeting Android and iOS (iosArm64, iosSimulatorArm64, iosX64)
- settings.gradle.kts and build.gradle.kts files
- Ktor and SQLDelight in shared commonMain dependencies
- A `ScanResult` data class, `ScanProcessor` class, and `ScannerGateway` interface in shared/commonMain
- Stub `AndroidScannerGateway` in androidMain and `IosScannerGateway` in iosMain

Output all files with full content. Use Kotlin DSL (kts) for all Gradle files.
```

---

### STEP 2 — Build the shared repository and use case

```
Using the KMP shared module scaffold from the previous step, now create:

1. `Asset.kt` — a data model with fields: id (String), name (String), location (String), status (String), lastScanned (Long timestamp)
2. `AssetRepository.kt` — interface with suspend fun `getAssetByCode(code: String): Asset?` and `logScan(code: String): Unit`
3. `LookupAssetUseCase.kt` — takes `AssetRepository` and `ScanProcessor`, has suspend fun `execute(rawScan: String): LookupResult` where LookupResult is a sealed class: Found(asset: Asset), NotFound(code: String), Invalid(reason: String)

Include full Kotlin code. No Android-specific imports anywhere in commonMain.
```

---

### STEP 3 — Build the iOS AVFoundation scanner

```
Create a native iOS Swift file called `AVFoundationScanner.swift` for an Xcode project (SwiftUI app, iOS 16+, Swift 5.9).

Requirements:
- Uses AVCaptureSession and AVCaptureMetadataOutput to scan barcodes from the device camera
- Supports: .qr, .pdf417, .code128, .code39, .ean13, .ean8, .dataMatrix, .aztec
- Publishes each detected code string once via a completion callback / Combine publisher (no duplicates within 2 seconds)
- Handles camera permission check and reports .notAuthorised status
- Clean class, no UIKit view code — just the session and detection logic
- Includes start() and stop() methods for lifecycle management

Output the full Swift file.
```

---

### STEP 4 — Build the SwiftUI Scanner screen

```
Create two Swift files for a SwiftUI iOS app (iOS 16+):

FILE 1: `ScannerView.swift`
- SwiftUI view showing a live camera preview using UIViewRepresentable
- Overlaid with a semi-transparent border/reticle box in the centre (matching a typical asset scanner UI)
- A torch toggle button (flashlight on/off) in the top right
- A "Enter code manually" text button at the bottom
- Calls into ScannerViewModel (ObservableObject) to drive state
- Shows a loading spinner when state is .loading
- Shows a green tick overlay briefly when a scan is successful before navigating away

FILE 2: `ScannerViewModel.swift`
- @MainActor ObservableObject
- Uses AVFoundationScanner to receive scanned strings
- Has published states: idle, scanning, loading, result(Asset), notFound(String), error(String)
- On scan received: calls LookupAssetUseCase.execute() (stubbed as async call returning mock data for now)
- Prevents duplicate scans within 2 seconds

Output both files in full.
```

---

### STEP 5 — Build the Asset Detail screen

```
Create `AssetDetailView.swift` and `AssetDetailViewModel.swift` for a SwiftUI iOS 16+ app.

The detail view shows:
- Asset name (large title)
- Asset ID / code (monospaced label)
- Location (with a location pin icon)
- Status (colour-coded badge: green=active, amber=maintenance, red=missing)
- Last scanned timestamp (formatted as "27 Jun 2026 at 14:32")
- A "Scan Another" button at the bottom that pops back to the scanner

Design should be clean and minimal — white cards on a light grey background, matching a professional asset management tool.

The ViewModel takes an `Asset` model and formats it for display. Include all code.
```

---

### STEP 6 — Wire up navigation and permissions

```
Create the following files for the iOS app entry point and navigation:

1. `ContentView.swift` — NavigationStack root that starts on ScannerView and pushes to AssetDetailView on successful scan
2. `AppDelegate.swift` — minimal, with scene configuration
3. `Info.plist` additions — NSCameraUsageDescription key with a clear description string

Also create a `PermissionView.swift` — a simple full-screen view shown when camera permission is denied, with an icon, explanation text, and an "Open Settings" button that deep-links to iOS Settings.

Output all files in full.
```

---

### STEP 7 — Link the KMP shared framework into Xcode

```
Write step-by-step instructions (suitable for a non-developer) for how to:

1. Run `./gradlew :shared:assembleXCFramework` from Terminal to build the shared Kotlin framework
2. Drag the resulting `shared.xcframework` into the Xcode project navigator
3. Add it to the target's "Frameworks, Libraries, and Embedded Content" section as "Embed & Sign"
4. Import and call `LookupAssetUseCase` from Swift in `ScannerViewModel.swift`

Include any gotchas (e.g. Rosetta/arm64 simulator issues) and how to resolve them.
Each step should be written so someone with no Xcode experience can follow it.
```

---

### STEP 8 — Verify, test, and handoff checklist

```
Generate a QA checklist for the Asset Intelligence iOS scanning module covering:

1. Camera permission — denied, first-time prompt, already granted
2. Scanning — QR code, Code128, EAN-13, unrecognised code
3. Result states — asset found, asset not found, network error
4. Navigation — scan → detail → scan another
5. Duplicate scan prevention (within 2 seconds)
6. Torch toggle
7. Manual code entry fallback
8. Orientation — portrait and landscape
9. Dark mode appearance
10. iOS versions — iOS 16 and iOS 17

Format as a table with columns: Test Case | Steps | Expected Result | Pass/Fail
```

---

## 7. Agents and Skills Reference

| What you need | Agent / Skill to use in Claude |
|---------------|-------------------------------|
| Scaffold KMP Gradle files | `claude` (general) — paste Step 1 prompt |
| Write Swift/SwiftUI code | `claude` (general) — paste Step 3–6 prompts |
| Architecture questions | `claude-code-guide` agent |
| Research Apple APIs | `deep-research` skill |
| Create Word doc of this plan | `docx` skill |
| Create a presentation | `pptx` skill |
| Code review of generated Swift | `review` skill |
| Security check of camera/permissions | `security-review` skill |

---

## 8. Prerequisites Checklist

Before starting, confirm you have:

- [ ] A Mac (Xcode only runs on macOS)
- [ ] Xcode 15 or later installed (free from the Mac App Store)
- [ ] An Apple Developer account (free for testing on your own device; £99/year for App Store)
- [ ] Java 17+ installed (required for Gradle/KMP)
- [ ] Android Studio installed (for the shared KMP module build)
- [ ] A physical iPhone or iPad for real camera testing (the Xcode simulator does not have a camera)
- [ ] The existing Android APK source code accessible (to extract business logic into the shared module)

---

## 9. Estimated Build Sequence

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | KMP scaffold + shared models | 1–2 hours with Claude |
| 2 | Shared repository + use case | 1 hour with Claude |
| 3 | iOS camera scanner | 1–2 hours with Claude |
| 4 | SwiftUI screens (scanner + detail) | 2–3 hours with Claude |
| 5 | Navigation + permissions | 1 hour with Claude |
| 6 | KMP framework linking in Xcode | 1–2 hours (follow Step 7 guide) |
| 7 | Connect to real backend API | 1–2 hours with Claude |
| 8 | QA and testing on device | 2–4 hours manual |

**Total estimated time:** 10–17 hours (mostly copy-paste from Claude + light Xcode configuration)

---

*Build plan authored for Kapiti Management — Asset Intelligence project, June 2026.*
