import SwiftUI

/// Full-screen barcode scanner view matching the Android `CameraBarcodeScannerScreen`.
///
/// Displays a live camera preview with a semi-transparent overlay, a clear cutout
/// rectangle outlined in Vairiot pink, and top-bar controls for torch and dismiss.
struct ScannerView: View {

    let onBarcodeScanned: (String) -> Void
    let onDismiss: () -> Void

    @StateObject private var scanner = CameraScanner()

    var body: some View {
        ZStack {
            if let error = scanner.cameraError {
                cameraErrorView(message: error)
            } else {
                cameraLayer
                overlayLayer
                controlsLayer
            }
        }
        .ignoresSafeArea()
        .onAppear { scanner.startScanning() }
        .onDisappear { scanner.stopScanning() }
        .onChange(of: scanner.scannedCode) { _, newValue in
            if let code = newValue {
                scanner.stopScanning()
                onBarcodeScanned(code)
            }
        }
    }

    // MARK: - Camera preview

    private var cameraLayer: some View {
        CameraPreview(session: scanner.captureSession)
    }

    // MARK: - Overlay with cutout

    private var overlayLayer: some View {
        GeometryReader { geometry in
            let cutoutWidth = geometry.size.width * 0.7
            let cutoutHeight = cutoutWidth * 0.6
            let cutoutX = (geometry.size.width - cutoutWidth) / 2
            let cutoutY = (geometry.size.height - cutoutHeight) / 2
            let cutoutRect = CGRect(x: cutoutX, y: cutoutY, width: cutoutWidth, height: cutoutHeight)
            let cornerRadius: CGFloat = 16

            Canvas { context, size in
                // Semi-transparent background
                let fullRect = CGRect(origin: .zero, size: size)
                let roundedCutout = Path(roundedRect: cutoutRect, cornerRadius: cornerRadius)

                var backgroundPath = Path(fullRect)
                backgroundPath.addPath(roundedCutout)

                context.fill(
                    backgroundPath,
                    with: .color(.black.opacity(0.55)),
                    style: FillStyle(eoFill: true)
                )

                // Pink border around the cutout
                context.stroke(
                    roundedCutout,
                    with: .color(.vairiotPink),
                    lineWidth: 3
                )
            }
            .allowsHitTesting(false)
        }
    }

    // MARK: - Controls

    private var controlsLayer: some View {
        VStack {
            HStack {
                // Torch toggle — top left
                Button(action: { scanner.toggleTorch() }) {
                    Image(systemName: scanner.isTorchOn ? "flashlight.on.fill" : "flashlight.off.fill")
                        .font(.title2)
                        .foregroundStyle(.white)
                        .frame(width: 48, height: 48)
                }
                .padding(.leading, 16)

                Spacer()

                // Close button — top right
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(width: 48, height: 48)
                }
                .padding(.trailing, 16)
            }
            .padding(.top, 16)

            // Instruction label
            Text("Point camera at barcode")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.top, 12)

            Spacer()
        }
    }

    // MARK: - Error fallback

    private func cameraErrorView(message: String) -> some View {
        VStack(spacing: 16) {
            Text(message)
                .font(.system(size: 16))
                .foregroundStyle(Color.vairiotCharcoal)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

            Button(action: onDismiss) {
                Text("Close")
                    .foregroundStyle(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(Color.vairiotViolet)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
    }
}
