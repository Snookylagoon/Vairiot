import SwiftUI

struct AuditRunView: View {

    @State private var viewModel: AuditRunViewModel
    @StateObject private var scanner = CameraScanner()

    init(audit: AuditCampaignResponse, apiClient: APIClient = .shared) {
        _viewModel = State(initialValue: AuditRunViewModel(audit: audit, apiClient: apiClient))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                headerSection
                statusSection

                if viewModel.isDraft {
                    startSection
                }

                if viewModel.isActive {
                    scanSection
                    lastScanSection
                    zoneSection
                    completeSection
                }

                if viewModel.isCompleted {
                    if viewModel.isLoadingReport {
                        ProgressView("Loading report...")
                            .padding()
                    } else if let report = viewModel.report {
                        reportSection(report)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Audit")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $viewModel.showScanner) {
            scannerSheet
        }
        .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
            Button("OK") { viewModel.errorMessage = nil }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
        .task {
            await viewModel.loadZones()
            if viewModel.isCompleted {
                await viewModel.loadReport()
            }
        }
        .onChange(of: scanner.scannedCode) { _, newCode in
            guard let code = newCode else { return }
            scanner.scannedCode = nil
            viewModel.showScanner = false
            Task { await viewModel.recordScan(tagValue: code) }
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(viewModel.audit.name)
                .font(.title2)
                .fontWeight(.bold)

            HStack(spacing: 8) {
                Label(viewModel.audit.mode.capitalized, systemImage: "eye")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                auditStatusBadge
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Status

    private var statusSection: some View {
        HStack {
            StatCard(
                title: "Scans",
                value: "\(viewModel.scanCount)",
                icon: "barcode.viewfinder",
                color: .vairiotViolet
            )

            StatCard(
                title: "Zones",
                value: "\(viewModel.zones.count)",
                icon: "map",
                color: .vairiotPink
            )
        }
    }

    // MARK: - Start

    private var startSection: some View {
        VStack(spacing: 12) {
            Text("This audit has not been started yet.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            LoadingButton(
                title: "Start Audit",
                isLoading: viewModel.isStarting
            ) {
                Task { await viewModel.startAudit() }
            }
            .tint(.successGreen)
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Scan

    private var scanSection: some View {
        VStack(spacing: 12) {
            Text("Scan Assets")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                viewModel.showScanner = true
            } label: {
                Label("Open Scanner", systemImage: "camera.viewfinder")
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(.vairiotViolet)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Last Scan Result

    @ViewBuilder
    private var lastScanSection: some View {
        if let result = viewModel.lastScanResult {
            HStack(spacing: 12) {
                switch result {
                case .found(let assetName):
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(Color.successGreen)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Found")
                            .font(.caption)
                            .foregroundStyle(Color.successGreen)
                        Text(assetName)
                            .font(.subheadline)
                            .fontWeight(.medium)
                    }

                case .unknown(let tagValue):
                    Image(systemName: "questionmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(Color.warningAmber)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Unknown Tag")
                            .font(.caption)
                            .foregroundStyle(Color.warningAmber)
                        Text(tagValue)
                            .font(.subheadline)
                            .fontWeight(.medium)
                    }
                }

                Spacer()

                if viewModel.isRecording {
                    ProgressView()
                }
            }
            .padding()
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Zone Submission

    private var zoneSection: some View {
        VStack(spacing: 12) {
            Text("Zone Submission")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)

            if !viewModel.zones.isEmpty {
                ForEach(viewModel.zones) { zone in
                    HStack {
                        Image(systemName: "mappin.circle.fill")
                            .foregroundStyle(Color.vairiotPink)
                        Text(zone.locationId)
                            .font(.subheadline)
                        Spacer()
                        Text(zone.submittedAt.formattedDateShort)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            HStack {
                TextField("Location ID", text: Binding(
                    get: { viewModel.selectedZoneLocationId ?? "" },
                    set: { viewModel.selectedZoneLocationId = $0.isEmpty ? nil : $0 }
                ))
                .textFieldStyle(.roundedBorder)

                LoadingButton(
                    title: "Submit",
                    isLoading: viewModel.isSubmittingZone
                ) {
                    guard let locationId = viewModel.selectedZoneLocationId,
                          !locationId.isEmpty else { return }
                    Task { await viewModel.submitZone(locationId: locationId) }
                }
                .frame(width: 100)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Complete

    private var completeSection: some View {
        VStack(spacing: 12) {
            Text("When all zones have been scanned, complete the audit to generate a report.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            LoadingButton(
                title: "Complete Audit",
                isLoading: viewModel.isCompleting,
                backgroundColor: .successGreen
            ) {
                Task { await viewModel.completeAudit() }
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Report

    private func reportSection(_ report: AuditReportResponse) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Audit Report")
                .font(.headline)

            VStack(spacing: 8) {
                reportRow(label: "Total Scanned", value: "\(report.totalScanned)", color: .vairiotViolet)
                reportRow(label: "Total Expected", value: "\(report.totalExpected)", color: .vairiotViolet)
                reportRow(label: "Found", value: "\(report.found)", color: .successGreen)
                reportRow(label: "Missing", value: "\(report.missing.count)", color: .errorRed)
                reportRow(label: "Unknown Tags", value: "\(report.unknownTags.count)", color: .warningAmber)
            }

            if !report.missing.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Missing Assets")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.errorRed)

                    ForEach(report.missing) { asset in
                        HStack {
                            Text(asset.assetNumber)
                                .font(.caption)
                                .fontWeight(.medium)
                            Text(asset.name)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            if !report.unknownTags.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Unknown Tags")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.warningAmber)

                    ForEach(report.unknownTags, id: \.self) { tag in
                        Text(tag)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func reportRow(label: String, value: String, color: Color) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundStyle(color)
        }
    }

    // MARK: - Scanner Sheet

    private var scannerSheet: some View {
        NavigationStack {
            ZStack {
                CameraPreview(session: scanner.captureSession)
                    .ignoresSafeArea()

                VStack {
                    Spacer()

                    if let error = scanner.cameraError {
                        Text(error)
                            .font(.subheadline)
                            .foregroundStyle(.white)
                            .padding()
                            .background(.ultraThinMaterial)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .padding()
                    }

                    HStack(spacing: 24) {
                        Button {
                            scanner.toggleTorch()
                        } label: {
                            Image(systemName: scanner.isTorchOn ? "flashlight.on.fill" : "flashlight.off.fill")
                                .font(.title2)
                                .foregroundStyle(.white)
                                .padding()
                                .background(.ultraThinMaterial)
                                .clipShape(Circle())
                        }
                    }
                    .padding(.bottom, 40)
                }
            }
            .navigationTitle("Scan Barcode")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        scanner.stopScanning()
                        viewModel.showScanner = false
                    }
                    .foregroundStyle(.white)
                }
            }
            .onAppear { scanner.startScanning() }
            .onDisappear { scanner.stopScanning() }
        }
    }

    // MARK: - Audit Status Badge

    private var auditStatusBadge: some View {
        let (text, color): (String, Color) = {
            switch viewModel.audit.status.lowercased() {
            case "draft":        return ("Draft", .gray)
            case "in_progress":  return ("In Progress", .warningAmber)
            case "completed":    return ("Completed", .successGreen)
            default:             return (viewModel.audit.status.capitalized, .gray)
            }
        }()
        return StatusBadge(text: text, color: color)
    }
}

// MARK: - Stat Card

private struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(color)
            Text(value)
                .font(.title)
                .fontWeight(.bold)
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Date Formatting Helper

private extension String {
    var formattedDateShort: String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = iso.date(from: self) ?? ISO8601DateFormatter().date(from: self) else {
            return self
        }
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}
