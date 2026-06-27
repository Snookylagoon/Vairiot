import AVFoundation
import Combine
import UIKit

/// AVFoundation-based barcode scanner using `AVCaptureMetadataOutput`.
///
/// Published properties drive the SwiftUI layer; the capture session is
/// exposed so `CameraPreview` can wrap its preview layer.
final class CameraScanner: NSObject, ObservableObject, AVCaptureMetadataOutputObjectsDelegate {

    // MARK: - Published state

    @Published var isScanning = false
    @Published var scannedCode: String?
    @Published var cameraError: String?
    @Published var isTorchOn = false

    // MARK: - Capture session

    let captureSession = AVCaptureSession()

    // MARK: - Private

    private let sessionQueue = DispatchQueue(label: "com.vairiot.camera-scanner", qos: .userInitiated)
    private var lastScannedCode: String?
    private var lastScannedTime: Date = .distantPast

    /// Symbologies matching the Android ML Kit defaults.
    private let supportedSymbologies: [AVMetadataObject.ObjectType] = [
        .qr,
        .pdf417,
        .code128,
        .code39,
        .ean13,
        .ean8,
        .dataMatrix,
        .aztec,
        .upce,
        .interleaved2of5,
    ]

    // MARK: - Duplicate suppression interval

    private let duplicateInterval: TimeInterval = 2.0

    // MARK: - Public API

    func startScanning() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.checkPermissionAndConfigure()
        }
    }

    func stopScanning() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            guard self.captureSession.isRunning else { return }
            self.captureSession.stopRunning()
            DispatchQueue.main.async {
                self.isScanning = false
            }
        }
    }

    func toggleTorch() {
        guard let device = AVCaptureDevice.default(for: .video),
              device.hasTorch else { return }
        do {
            try device.lockForConfiguration()
            let newMode: AVCaptureDevice.TorchMode = device.torchMode == .on ? .off : .on
            device.torchMode = newMode
            device.unlockForConfiguration()
            DispatchQueue.main.async {
                self.isTorchOn = newMode == .on
            }
        } catch {
            // Torch toggle failed silently — not critical.
        }
    }

    // MARK: - Permission & configuration

    private func checkPermissionAndConfigure() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                if granted {
                    self?.sessionQueue.async { self?.configureSession() }
                } else {
                    DispatchQueue.main.async {
                        self?.cameraError = "Camera permission was denied. Enable it in Settings to scan barcodes."
                    }
                }
            }
        case .denied, .restricted:
            DispatchQueue.main.async {
                self.cameraError = "Camera permission is required to scan barcodes. Enable it in Settings."
            }
        @unknown default:
            DispatchQueue.main.async {
                self.cameraError = "Unable to access the camera."
            }
        }
    }

    private func configureSession() {
        guard !captureSession.isRunning else { return }

        captureSession.beginConfiguration()
        defer { captureSession.commitConfiguration() }

        // Video input
        guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
                ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
                ?? AVCaptureDevice.default(for: .video) else {
            DispatchQueue.main.async {
                self.cameraError = "This device has no camera. Use a hardware scanner or enter the code manually."
            }
            return
        }

        do {
            let videoInput = try AVCaptureDeviceInput(device: videoDevice)
            if captureSession.canAddInput(videoInput) {
                captureSession.addInput(videoInput)
            } else {
                DispatchQueue.main.async {
                    self.cameraError = "Unable to add camera input."
                }
                return
            }
        } catch {
            DispatchQueue.main.async {
                self.cameraError = "Camera unavailable: \(error.localizedDescription)"
            }
            return
        }

        // Metadata output for barcode detection
        let metadataOutput = AVCaptureMetadataOutput()
        if captureSession.canAddOutput(metadataOutput) {
            captureSession.addOutput(metadataOutput)
            metadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            // Filter to only the types AVFoundation actually supports on this device.
            let available = metadataOutput.availableMetadataObjectTypes
            metadataOutput.metadataObjectTypes = supportedSymbologies.filter { available.contains($0) }
        } else {
            DispatchQueue.main.async {
                self.cameraError = "Unable to configure barcode scanning."
            }
            return
        }

        captureSession.startRunning()
        DispatchQueue.main.async {
            self.isScanning = true
        }
    }

    // MARK: - AVCaptureMetadataOutputObjectsDelegate

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let readableObject = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let stringValue = readableObject.stringValue,
              !stringValue.isEmpty else {
            return
        }

        // Duplicate suppression: ignore the same code within the cooldown window.
        let now = Date()
        if stringValue == lastScannedCode, now.timeIntervalSince(lastScannedTime) < duplicateInterval {
            return
        }

        lastScannedCode = stringValue
        lastScannedTime = now
        scannedCode = stringValue
    }
}
