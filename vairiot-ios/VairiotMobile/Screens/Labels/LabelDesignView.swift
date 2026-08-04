import SwiftUI
import CoreImage.CIFilterBuiltins
import CoreBluetooth

// MARK: - Content Field Toggles

struct ContentFields {
    var name = true
    var assetNumber = true
    var serialNumber = true
    /// GS1 identifier line (HRI); falls back to the legacy barcode value.
    var barcode = true
    var site = true
    var category = false
    var companyName = false
    var companyAddress = false
    var companyEmail = false
}

// MARK: - Barcode Standard

enum BarcodeStandard: String, CaseIterable, Identifiable {
    case qr = "QR Code"
    case code128 = "Code 128"
    case pdf417 = "PDF417"
    case aztec = "Aztec"

    var id: String { rawValue }

    var is2D: Bool {
        switch self {
        case .qr, .pdf417, .aztec: return true
        case .code128: return false
        }
    }

    /// Maps a web-designer barcodeType to what this device can render.
    /// Core Image has no Data Matrix, EAN, UPC, ITF or Code 39/93 generators,
    /// so those fall back to QR (2D) or Code 128 (1D) with a visible note.
    static func from(templateType raw: String?) -> (standard: BarcodeStandard, note: String?) {
        switch (raw ?? "qrcode").lowercased() {
        case "qrcode":    return (.qr, nil)
        case "code128":   return (.code128, nil)
        case "pdf417":    return (.pdf417, nil)
        case "azteccode": return (.aztec, nil)
        case "datamatrix":
            return (.qr, "Rendered as QR on this device")
        case "code39", "code93", "ean13", "upca", "itf14":
            return (.code128, "Rendered as Code 128 on this device")
        default:
            return (.qr, nil)
        }
    }
}

// MARK: - Label Size

/// Physical label size in millimetres. Presets mirror the web designer's
/// Avery codes; arbitrary custom sizes are supported. 1 mm = 72/25.4 pt.
struct LabelSize: Equatable {
    var widthMm: Double
    var heightMm: Double

    private static let ptPerMm: CGFloat = 72.0 / 25.4

    var width: CGFloat { CGFloat(widthMm) * Self.ptPerMm }
    var height: CGFloat { CGFloat(heightMm) * Self.ptPerMm }

    var label: String {
        String(format: "%.0f×%.0fmm", widthMm, heightMm)
    }

    /// Avery L7651 — the previous default.
    static let fallback = LabelSize(widthMm: 38.1, heightMm: 21.2)

    static let presets: [String: LabelSize] = [
        "avery-5167":  LabelSize(widthMm: 44.5, heightMm: 12.7),
        "avery-6570":  LabelSize(widthMm: 31.75, heightMm: 19.05),
        "avery-5160":  LabelSize(widthMm: 66.7, heightMm: 25.4),
        "avery-l7651": LabelSize(widthMm: 38.1, heightMm: 21.2),
        "avery-l7159": LabelSize(widthMm: 63.5, heightMm: 38.1),
        "avery-5163":  LabelSize(widthMm: 101.6, heightMm: 50.8),
        "avery-l7163": LabelSize(widthMm: 99.1, heightMm: 38.1),
    ]

    static func from(config: LabelTemplateConfig) -> LabelSize {
        if config.sizePreset == "custom",
           let w = config.customW, let h = config.customH, w > 0, h > 0 {
            return LabelSize(widthMm: min(w, 300), heightMm: min(h, 300))
        }
        if let code = config.sizePreset, let preset = presets[code.lowercased()] {
            return preset
        }
        return .fallback
    }
}

// MARK: - Label Design View

/// Choose-a-template-and-print screen. Templates are designed in the web
/// app's label designer; this screen fetches them, applies the saved config
/// (size, barcode, fields, per-printer settings) and prints.
struct LabelDesignView: View {

    let asset: AssetResponse
    let apiClient: APIClient

    private static let templatesCacheKey = "cachedLabelTemplatesJSON"

    @State private var templates: [LabelTemplateResponse] = []
    @State private var selectedTemplateId: String?
    @State private var isLoadingTemplates = true
    @State private var templatesError: String?

    // Render state derived from the selected template's config
    @State private var fields = ContentFields()
    @State private var labelSize = LabelSize.fallback
    @State private var selectedBarcode: BarcodeStandard = .qr
    @State private var barcodeSubstitutionNote: String?
    @State private var printRotation = 0
    @State private var printCopies = 1
    @State private var tunedPrinterName: String?

    @State private var company: CompanyResponse?
    @State private var isLoadingCompany = true
    @State private var gs1: Gs1EncodingResponse?

    @State private var showPrinterSetup = false
    @State private var isPrinting = false
    @State private var statusMessage: String?
    @State private var statusIsError = false

    @State private var bluetoothPrinter: BluetoothPrinterManager?
    @State private var savedPrinterName: String?

    private var selectedTemplate: LabelTemplateResponse? {
        templates.first { $0.id == selectedTemplateId }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if isLoadingTemplates && templates.isEmpty {
                    loadingSection
                } else if templates.isEmpty {
                    emptyTemplatesSection
                } else {
                    templateSection
                    previewSection
                }
                printerSection
            }
            .padding()
        }
        .safeAreaInset(edge: .bottom) {
            printButton
        }
        .navigationTitle("Print Label")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    saveAsImage()
                } label: {
                    Image(systemName: "square.and.arrow.down")
                }
                .disabled(selectedTemplate == nil)
            }
        }
        .task {
            await loadTemplates()
            await loadCompany()
            await loadGs1()
            bluetoothPrinter = BluetoothPrinterManager()
            savedPrinterName = UserDefaults.standard.string(forKey: "savedPrinterName")
        }
        .onChange(of: selectedTemplateId) {
            applySelectedTemplate()
        }
        .sheet(isPresented: $showPrinterSetup) {
            NavigationStack {
                PrinterSetupView(
                    printerManager: bluetoothPrinter ?? BluetoothPrinterManager(),
                    savedPrinterName: $savedPrinterName
                )
            }
        }
    }

    // MARK: - Template Section

    private var templateSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                sectionHeader("Template")
                Spacer()
                Button {
                    Task { await loadTemplates() }
                } label: {
                    if isLoadingTemplates {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "arrow.clockwise")
                            .font(.subheadline)
                    }
                }
                .disabled(isLoadingTemplates)
                .tint(.vairiotViolet)
            }

            Picker("Template", selection: $selectedTemplateId) {
                ForEach(templates) { template in
                    Text(template.name).tag(Optional(template.id))
                }
            }
            .pickerStyle(.menu)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 4) {
                Text("\(selectedBarcode.rawValue) · \(labelSize.label)")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if let note = barcodeSubstitutionNote {
                    Text(note)
                        .font(.caption)
                        .foregroundStyle(Color.warningAmber)
                }
                if printCopies > 1 {
                    Text("\(printCopies) copies per label on Bluetooth printers")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let hint = printerMismatchHint {
                    Text(hint)
                        .font(.caption)
                        .foregroundStyle(Color.warningAmber)
                }
                if let err = templatesError {
                    Text(err)
                        .font(.caption)
                        .foregroundStyle(Color.errorRed)
                }
            }
            .padding(.horizontal, 4)
        }
    }

    private var loadingSection: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Loading templates…")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    private var emptyTemplatesSection: some View {
        VStack(spacing: 12) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("No Label Templates")
                .font(.headline)
            Text("Label templates are designed in the Vairiot web app under Asset Labels. Once saved there, they appear here automatically.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if let err = templatesError {
                Text(err)
                    .font(.caption)
                    .foregroundStyle(Color.errorRed)
                    .multilineTextAlignment(.center)
            }
            Button {
                Task { await loadTemplates() }
            } label: {
                Label("Refresh", systemImage: "arrow.clockwise")
                    .font(.subheadline)
            }
            .tint(.vairiotViolet)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .padding(.horizontal, 16)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var printerMismatchHint: String? {
        guard let tuned = tunedPrinterName?.trimmingCharacters(in: .whitespacesAndNewlines),
              !tuned.isEmpty else { return nil }
        if let saved = savedPrinterName?.trimmingCharacters(in: .whitespacesAndNewlines),
           !saved.isEmpty {
            let a = saved.lowercased()
            let b = tuned.lowercased()
            if a.contains(b) || b.contains(a) { return nil }
        }
        return "Template is tuned for ‘\(tuned)’"
    }

    // MARK: - Templates Loading

    private func loadTemplates() async {
        isLoadingTemplates = true
        templatesError = nil
        do {
            let fetched: [LabelTemplateResponse] = try await apiClient.request(.getLabelTemplates)
            templates = fetched
            if let data = try? JSONEncoder().encode(fetched) {
                UserDefaults.standard.set(data, forKey: Self.templatesCacheKey)
            }
        } catch {
            let message = (error as? APIError)?.userMessage ?? error.localizedDescription
            if let data = UserDefaults.standard.data(forKey: Self.templatesCacheKey),
               let cached = try? JSONDecoder().decode([LabelTemplateResponse].self, from: data),
               !cached.isEmpty {
                templates = cached
                templatesError = "Couldn’t refresh — showing saved templates. \(message)"
            } else {
                templatesError = message
            }
        }
        isLoadingTemplates = false

        if selectedTemplateId == nil || !templates.contains(where: { $0.id == selectedTemplateId }) {
            selectedTemplateId = templates.first?.id
        }
        applySelectedTemplate()
    }

    private func applySelectedTemplate() {
        guard let template = selectedTemplate else { return }
        let cfg = template.config ?? LabelTemplateConfig()

        let mapping = BarcodeStandard.from(templateType: cfg.barcodeType)
        selectedBarcode = mapping.standard
        barcodeSubstitutionNote = mapping.note

        labelSize = LabelSize.from(config: cfg)

        var f = ContentFields()
        if let tf = cfg.fields {
            f.name = tf.name ?? f.name
            f.assetNumber = tf.assetNumber ?? f.assetNumber
            f.serialNumber = tf.serialNumber ?? f.serialNumber
            f.barcode = tf.barcode ?? f.barcode
            f.site = tf.site ?? f.site
            f.category = tf.category ?? f.category
            f.companyName = tf.companyName ?? f.companyName
            f.companyAddress = tf.companyAddress ?? f.companyAddress
            f.companyEmail = tf.companyEmail ?? f.companyEmail
        }
        fields = f

        printRotation = cfg.effectiveRotation
        printCopies = cfg.effectiveCopies
        tunedPrinterName = cfg.printer?.name
    }

    // MARK: - Preview

    private var previewSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Preview")

            let scale = previewScale
            labelContent
                .frame(width: labelSize.width * scale, height: labelSize.height * scale)
                .background(.white)
                .border(Color.gray.opacity(0.3), width: 1)
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
                .frame(maxWidth: .infinity)
        }
    }

    private var previewScale: CGFloat {
        min((UIScreen.main.bounds.width - 32) / labelSize.width, 2.2)
    }

    private var labelContent: some View {
        let scale = previewScale
        let pad = labelSize.height * scale * 0.08

        return GeometryReader { geo in
            if selectedBarcode.is2D {
                HStack(alignment: .center, spacing: 0) {
                    let barcodeSize = min(geo.size.height - pad * 2, geo.size.width * 0.35)
                    barcodeImage
                        .frame(width: barcodeSize, height: barcodeSize)

                    Spacer().frame(width: geo.size.width * 0.04)

                    textFields(fontSize: dynamicFontSize(for: labelSize.height * scale))
                }
                .padding(.horizontal, geo.size.width * 0.04)
                .padding(.vertical, pad)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(spacing: 2) {
                    textFields(fontSize: dynamicFontSize(for: labelSize.height * scale * 0.65))

                    barcodeImage
                        .frame(height: (geo.size.height - pad * 2) * 0.3)
                        .padding(.horizontal, geo.size.width * 0.06)
                }
                .padding(.horizontal, geo.size.width * 0.04)
                .padding(.vertical, pad)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    @ViewBuilder
    private var barcodeImage: some View {
        let payload = barcodePayload()
        if let img = generateBarcode(from: payload, type: selectedBarcode) {
            Image(uiImage: img)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
        } else {
            Rectangle()
                .fill(Color.gray.opacity(0.15))
                .overlay {
                    Image(systemName: "qrcode")
                        .foregroundStyle(.gray)
                }
        }
    }

    private var hasCompanyBottom: Bool {
        guard let co = company else { return false }
        if fields.companyName, co.tradingName ?? co.legalName != nil { return true }
        if fields.companyAddress { return true }
        if fields.companyEmail, co.primaryContactEmail != nil { return true }
        return false
    }

    private func textFields(fontSize: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if fields.name {
                Text(asset.name)
                    .font(.system(size: fontSize, weight: .bold))
                    .foregroundStyle(.black)
                    .lineLimit(2)
            }
            if fields.assetNumber {
                Text(asset.assetNumber)
                    .font(.system(size: fontSize * 0.82))
                    .foregroundStyle(.gray)
            }
            if fields.serialNumber, let sn = asset.serialNumber, !sn.isEmpty {
                Text("SN: \(sn)")
                    .font(.system(size: fontSize * 0.82))
                    .foregroundStyle(.gray)
            }
            if fields.barcode {
                // GS1 identifier line — the HRI carries the tenant mark so
                // identifiers stay distinguishable across tenants.
                if let gs1 {
                    Text(gs1.hri)
                        .font(.system(size: fontSize * 0.82, design: .monospaced))
                        .foregroundStyle(.black)
                } else if let bc = asset.barcode, !bc.isEmpty {
                    Text("BC: \(bc)")
                        .font(.system(size: fontSize * 0.82))
                        .foregroundStyle(.gray)
                }
            }
            if fields.site, let site = asset.site?.name {
                Text(site)
                    .font(.system(size: fontSize * 0.82))
                    .foregroundStyle(.gray)
            }
            if fields.category, let cat = asset.category?.name {
                Text(cat)
                    .font(.system(size: fontSize * 0.82))
                    .foregroundStyle(.gray)
            }
            if hasCompanyBottom {
                Spacer(minLength: 0)
                companyFields(fontSize: fontSize)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: hasCompanyBottom ? .infinity : nil, alignment: .topLeading)
    }

    @ViewBuilder
    private func companyFields(fontSize: CGFloat) -> some View {
        if let co = company {
            if fields.companyName, let name = co.tradingName ?? co.legalName {
                Text(name)
                    .font(.system(size: fontSize * 0.7))
                    .foregroundStyle(.gray)
                    .lineLimit(1)
            }
            if fields.companyAddress {
                Text(formattedAddress(co))
                    .font(.system(size: fontSize * 0.65))
                    .foregroundStyle(.gray)
                    .lineLimit(2)
            }
            if fields.companyEmail, let email = co.primaryContactEmail {
                Text(email)
                    .font(.system(size: fontSize * 0.65))
                    .foregroundStyle(.gray)
                    .lineLimit(1)
            }
        }
    }

    // MARK: - Printer Section

    private var printerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Printer")

            Button {
                showPrinterSetup = true
            } label: {
                HStack {
                    Image(systemName: "printer")
                        .foregroundStyle(Color.vairiotViolet)
                    if let name = savedPrinterName {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(name)
                                .font(.subheadline)
                                .foregroundStyle(.primary)
                            Text("Bluetooth Printer")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        Text("Find Bluetooth Printer")
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding()
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)

            if let msg = statusMessage {
                Text(msg)
                    .font(.caption)
                    .foregroundStyle(statusIsError ? Color.errorRed : Color.successGreen)
                    .padding(.horizontal, 4)
            }
        }
    }

    // MARK: - Print Button

    private var printButton: some View {
        VStack(spacing: 8) {
            Button {
                if savedPrinterName != nil {
                    printViaBluetooth()
                } else {
                    printViaAirPrint()
                }
            } label: {
                HStack {
                    if isPrinting {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: savedPrinterName != nil ? "dot.radiowaves.left.and.right" : "printer")
                    }
                    Text(savedPrinterName != nil ? "Print via Bluetooth" : "Print via AirPrint")
                }
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(.vairiotViolet)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .disabled(isPrinting || selectedTemplate == nil)

            if savedPrinterName != nil {
                Button {
                    printViaAirPrint()
                } label: {
                    Label("AirPrint", systemImage: "printer")
                        .font(.subheadline)
                }
                .tint(.secondary)
                .disabled(isPrinting || selectedTemplate == nil)
            }
        }
        .padding()
        .background(.ultraThinMaterial)
    }

    // MARK: - Barcode Generation

    private func barcodePayload() -> String {
        // GS1-identified assets encode a plain GS1 Digital Link URL in 2D
        // codes — readable by any phone camera — and a GS1-128 element string
        // in Code 128. Mirrors the web label designer's barcodePayload().
        if let gs1 {
            if selectedBarcode.is2D { return gs1.digitalLink }
            if selectedBarcode == .code128 { return gs1.elementString }
        }
        if selectedBarcode.is2D {
            let payload: [String: String] = [
                "id": asset.id,
                "number": asset.assetNumber,
                "name": asset.name
            ]
            if let data = try? JSONSerialization.data(withJSONObject: payload),
               let str = String(data: data, encoding: .utf8) {
                return str
            }
            return asset.assetNumber
        } else {
            return asset.barcode ?? asset.serialNumber ?? asset.assetNumber
        }
    }

    private func generateBarcode(from string: String, type: BarcodeStandard) -> UIImage? {
        let context = CIContext()

        let filterName: String
        switch type {
        case .qr:      filterName = "CIQRCodeGenerator"
        case .code128: filterName = "CICode128BarcodeGenerator"
        case .pdf417:  filterName = "CIPDF417BarcodeGenerator"
        case .aztec:   filterName = "CIAztecCodeGenerator"
        }

        guard let filter = CIFilter(name: filterName),
              let data = string.data(using: .utf8) else { return nil }

        filter.setValue(data, forKey: "inputMessage")
        if type == .qr {
            filter.setValue("M", forKey: "inputCorrectionLevel")
        }

        guard let ciImage = filter.outputImage else { return nil }

        let scaleX = 300.0 / ciImage.extent.size.width
        let scaleY = 300.0 / ciImage.extent.size.height
        let scaled = ciImage.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    // MARK: - Render Label

    private func renderLabelImage() -> UIImage? {
        let renderScale: CGFloat = 4
        let w = labelSize.width * renderScale
        let h = labelSize.height * renderScale

        let renderer = UIGraphicsImageRenderer(size: CGSize(width: w, height: h))

        return renderer.image { ctx in
            let rect = CGRect(x: 0, y: 0, width: w, height: h)
            UIColor.white.setFill()
            ctx.fill(rect)

            let padH = w * 0.04
            let padV = h * 0.08
            let gap = w * 0.03

            if selectedBarcode.is2D {
                let barcodeSize = min(h - padV * 2, w * 0.35)
                let barcodeRect = CGRect(
                    x: padH,
                    y: (h - barcodeSize) / 2,
                    width: barcodeSize,
                    height: barcodeSize
                )
                if let img = generateBarcode(from: barcodePayload(), type: selectedBarcode) {
                    img.draw(in: barcodeRect)
                }
                drawTextFields(
                    in: CGRect(x: barcodeRect.maxX + gap, y: padV, width: w - barcodeRect.maxX - gap - padH, height: h - padV * 2),
                    renderScale: renderScale
                )
            } else {
                let barcodeH = h * 0.3
                drawTextFields(
                    in: CGRect(x: padH, y: padV, width: w - padH * 2, height: h - barcodeH - padV * 2),
                    renderScale: renderScale
                )
                if let img = generateBarcode(from: barcodePayload(), type: selectedBarcode) {
                    let barcodeRect = CGRect(x: w * 0.1, y: h - barcodeH - padV, width: w * 0.8, height: barcodeH)
                    img.draw(in: barcodeRect)
                }
            }
        }
    }

    private func drawTextFields(in rect: CGRect, renderScale: CGFloat) {
        let baseFontSize = dynamicFontSize(for: labelSize.height) * renderScale
        let titleFont = UIFont.boldSystemFont(ofSize: baseFontSize)
        let bodyFont = UIFont.systemFont(ofSize: baseFontSize * 0.82)
        let smallFont = UIFont.systemFont(ofSize: baseFontSize * 0.7)

        let titleAttr: [NSAttributedString.Key: Any] = [.font: titleFont, .foregroundColor: UIColor.black]
        let bodyAttr: [NSAttributedString.Key: Any] = [.font: bodyFont, .foregroundColor: UIColor.gray]
        let smallAttr: [NSAttributedString.Key: Any] = [.font: smallFont, .foregroundColor: UIColor.gray]

        var lines: [(String, [NSAttributedString.Key: Any])] = []

        if fields.name { lines.append((asset.name, titleAttr)) }
        if fields.assetNumber { lines.append((asset.assetNumber, bodyAttr)) }
        if fields.serialNumber, let sn = asset.serialNumber, !sn.isEmpty { lines.append(("SN: \(sn)", bodyAttr)) }
        if fields.barcode {
            if let gs1 {
                let hriFont = UIFont.monospacedSystemFont(ofSize: baseFontSize * 0.82, weight: .medium)
                lines.append((gs1.hri, [.font: hriFont, .foregroundColor: UIColor.black]))
            } else if let bc = asset.barcode, !bc.isEmpty {
                lines.append(("BC: \(bc)", bodyAttr))
            }
        }
        if fields.site, let site = asset.site?.name { lines.append((site, bodyAttr)) }
        if fields.category, let cat = asset.category?.name { lines.append((cat, bodyAttr)) }

        var bottomLines: [(String, [NSAttributedString.Key: Any])] = []
        if let co = company {
            if fields.companyName, let name = co.tradingName ?? co.legalName { bottomLines.append((name, smallAttr)) }
            if fields.companyAddress { bottomLines.append((formattedAddress(co), smallAttr)) }
            if fields.companyEmail, let email = co.primaryContactEmail { bottomLines.append((email, smallAttr)) }
        }

        let lineSpacing: CGFloat = 1.15
        var y = rect.minY
        for (text, attr) in lines {
            let ns = NSString(string: text)
            let font = attr[.font] as! UIFont
            let lineRect = CGRect(x: rect.minX, y: y, width: rect.width, height: font.lineHeight * 1.5)
            ns.draw(with: lineRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: attr, context: nil)
            y += font.lineHeight * lineSpacing
            if y > rect.maxY { break }
        }

        if !bottomLines.isEmpty {
            var bottomY = rect.maxY
            for (text, attr) in bottomLines.reversed() {
                let font = attr[.font] as! UIFont
                bottomY -= font.lineHeight * lineSpacing
                let ns = NSString(string: text)
                ns.draw(
                    with: CGRect(x: rect.minX, y: bottomY, width: rect.width, height: font.lineHeight * 1.5),
                    options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
                    attributes: attr,
                    context: nil
                )
            }
        }
    }

    /// Rotates by the template's printRotation before ESC/POS conversion.
    private func rotatedImage(_ image: UIImage, degrees: Int) -> UIImage {
        let d = ((degrees % 360) + 360) % 360
        guard d != 0 else { return image }
        let radians = CGFloat(d) * .pi / 180
        let newSize = d % 180 == 0
            ? image.size
            : CGSize(width: image.size.height, height: image.size.width)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { ctx in
            let c = ctx.cgContext
            c.translateBy(x: newSize.width / 2, y: newSize.height / 2)
            c.rotate(by: radians)
            image.draw(in: CGRect(
                x: -image.size.width / 2,
                y: -image.size.height / 2,
                width: image.size.width,
                height: image.size.height
            ))
        }
    }

    // MARK: - Print Actions

    private func printViaAirPrint() {
        guard let image = renderLabelImage() else {
            showStatus("Failed to render label", isError: true)
            return
        }

        // The AirPrint dialog handles orientation and copies itself, so the
        // template's rotation/copies settings only apply to the Bluetooth path.
        let printController = UIPrintInteractionController.shared
        let printInfo = UIPrintInfo(dictionary: nil)
        printInfo.jobName = "Vairiot Label - \(asset.assetNumber)"
        printInfo.outputType = .photo
        printController.printInfo = printInfo
        printController.printingItem = image

        printController.present(animated: true) { _, completed, error in
            if let error {
                showStatus("Print failed: \(error.localizedDescription)", isError: true)
            } else if completed {
                showStatus("Label printed successfully", isError: false)
                recordPrint(printerId: nil)
            }
        }
    }

    private func printViaBluetooth() {
        guard let printer = bluetoothPrinter,
              let address = UserDefaults.standard.string(forKey: "savedPrinterAddress") else {
            showStatus("No printer selected", isError: true)
            return
        }

        guard let image = renderLabelImage() else {
            showStatus("Failed to render label", isError: true)
            return
        }

        let rotated = rotatedImage(image, degrees: printRotation)

        isPrinting = true
        printer.printImage(rotated, toAddress: address, copies: printCopies) { success, error in
            DispatchQueue.main.async {
                isPrinting = false
                if success {
                    showStatus("Label sent to printer", isError: false)
                    recordPrint(printerId: address)
                } else {
                    showStatus(error ?? "Print failed", isError: true)
                }
            }
        }
    }

    /// Best-effort print audit trail — never blocks or fails the print itself.
    private func recordPrint(printerId: String?) {
        guard asset.individualAssetReference != nil else { return }
        let symbology: String?
        switch selectedBarcode {
        case .qr: symbology = "QR"
        case .code128: symbology = "GS1_128"
        case .pdf417, .aztec: symbology = nil
        }
        guard let symbology else { return }
        let templateCode = selectedTemplate?.name ?? "mobile-ios"
        Task {
            try? await apiClient.requestVoid(.recordLabelPrint(LabelPrintRequest(
                assetIds: [asset.id],
                templateCode: templateCode,
                symbology: symbology,
                deviceId: DeviceUDIDStore.udid,
                printerId: printerId
            )))
        }
    }

    private func saveAsImage() {
        guard selectedTemplate != nil, let image = renderLabelImage() else {
            showStatus("Failed to render label", isError: true)
            return
        }
        UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
        showStatus("Label saved to Photos", isError: false)
    }

    private func showStatus(_ message: String, isError: Bool) {
        statusMessage = message
        statusIsError = isError
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            if statusMessage == message { statusMessage = nil }
        }
    }

    // MARK: - Helpers

    private func dynamicFontSize(for height: CGFloat) -> CGFloat {
        // 37.5 mm tall (≈106 pt) is the reference height for an 11 pt title.
        let scale = height / 106.0
        return max(3, min(14, 11 * scale))
    }

    private func formattedAddress(_ co: CompanyResponse) -> String {
        [co.addressLine1, co.addressLine2, co.city, co.stateProvince, co.postalCode, co.country]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }

    private func loadCompany() async {
        do {
            company = try await apiClient.request(.getCompany)
        } catch {
            company = nil
        }
        isLoadingCompany = false
    }

    private func loadGs1() async {
        guard let iar = asset.individualAssetReference else { gs1 = nil; return }
        guard let ident = await Gs1IdentificationStore.fetch(apiClient: apiClient) else { gs1 = nil; return }
        gs1 = Gs1IdentificationStore.encodeLocally(iar: iar, assetGiai: asset.giai, ident: ident)
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.subheadline)
            .fontWeight(.semibold)
            .foregroundStyle(.secondary)
    }
}

// MARK: - Bluetooth Printer Manager

final class BluetoothPrinterManager: NSObject, ObservableObject, CBCentralManagerDelegate, CBPeripheralDelegate {

    @Published var isBluetoothOn = false
    @Published var discoveredDevices: [(name: String, identifier: UUID)] = []
    @Published var isScanning = false
    @Published var connectedPeripheralName: String?

    private var centralManager: CBCentralManager!
    private var discoveredPeripherals: [CBPeripheral] = []
    private var connectedPeripheral: CBPeripheral?
    private var writeCharacteristic: CBCharacteristic?
    private var pendingImageData: Data?
    private var printCompletion: ((Bool, String?) -> Void)?

    override init() {
        super.init()
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }

    func startScanning() {
        guard centralManager.state == .poweredOn else { return }
        discoveredDevices = []
        discoveredPeripherals = []
        isScanning = true
        centralManager.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])

        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
            self?.stopScanning()
        }
    }

    func stopScanning() {
        centralManager.stopScan()
        isScanning = false
    }

    func selectPrinter(name: String, identifier: UUID) {
        UserDefaults.standard.set(name, forKey: "savedPrinterName")
        UserDefaults.standard.set(identifier.uuidString, forKey: "savedPrinterAddress")
    }

    func removePrinter() {
        UserDefaults.standard.removeObject(forKey: "savedPrinterName")
        UserDefaults.standard.removeObject(forKey: "savedPrinterAddress")
        connectedPeripheralName = nil
    }

    func printImage(_ image: UIImage, toAddress address: String, copies: Int = 1, completion: @escaping (Bool, String?) -> Void) {
        guard let uuid = UUID(uuidString: address) else {
            completion(false, "Invalid printer address")
            return
        }

        guard let peripheral = discoveredPeripherals.first(where: { $0.identifier == uuid }) else {
            printCompletion = completion
            pendingImageData = convertToESCPOS(image, copies: copies)
            centralManager.scanForPeripherals(withServices: nil, options: nil)
            DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
                if self?.connectedPeripheral == nil {
                    self?.centralManager.stopScan()
                    completion(false, "Printer not found. Make sure it is powered on.")
                }
            }
            return
        }

        pendingImageData = convertToESCPOS(image, copies: copies)
        printCompletion = completion
        centralManager.connect(peripheral, options: nil)
    }

    /// Repeats the single-label ESC/POS payload for multi-copy templates.
    private func convertToESCPOS(_ image: UIImage, copies: Int) -> Data? {
        guard let single = convertToESCPOS(image) else { return nil }
        let count = min(max(copies, 1), 20)
        guard count > 1 else { return single }
        var out = Data(capacity: single.count * count)
        for _ in 0..<count { out.append(single) }
        return out
    }

    private func convertToESCPOS(_ image: UIImage) -> Data? {
        let maxWidth: CGFloat = 576
        var img = image
        if img.size.width > maxWidth {
            let scale = maxWidth / img.size.width
            let newSize = CGSize(width: maxWidth, height: img.size.height * scale)
            let renderer = UIGraphicsImageRenderer(size: newSize)
            img = renderer.image { _ in img.draw(in: CGRect(origin: .zero, size: newSize)) }
        }

        guard let cgImage = img.cgImage else { return nil }
        let w = cgImage.width
        let h = cgImage.height

        guard let ctx = CGContext(
            data: nil, width: w, height: h,
            bitsPerComponent: 8, bytesPerRow: w * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }

        ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: w, height: h))
        guard let pixelData = ctx.data else { return nil }
        let data = pixelData.bindMemory(to: UInt8.self, capacity: w * h * 4)

        var escpos = Data()
        escpos.append(contentsOf: [0x1B, 0x40])
        escpos.append(contentsOf: [0x1B, 0x33, 0x00])

        // ESC * 33 (24-dot double density): n = dot columns; each column is
        // 3 bytes, byte k covering rows y+8k..y+8k+7, top row in the MSB.
        for stripStart in stride(from: 0, to: h, by: 24) {
            escpos.append(contentsOf: [0x1B, 0x2A, 33])
            escpos.append(UInt8(w & 0xFF))
            escpos.append(UInt8((w >> 8) & 0xFF))

            for x in 0..<w {
                for k in 0..<3 {
                    var byte: UInt8 = 0
                    for bit in 0..<8 {
                        let y = stripStart + k * 8 + bit
                        if x < w && y < h {
                            let offset = (y * w + x) * 4
                            let r = Int(data[offset])
                            let g = Int(data[offset + 1])
                            let b = Int(data[offset + 2])
                            let lum = (r * 299 + g * 587 + b * 114) / 1000
                            if lum < 128 {
                                byte |= (1 << (7 - bit))
                            }
                        }
                    }
                    escpos.append(byte)
                }
            }

            escpos.append(contentsOf: [0x0A])
        }

        escpos.append(contentsOf: [0x0A, 0x0A, 0x0A])
        return escpos
    }

    // MARK: - CBCentralManagerDelegate

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        DispatchQueue.main.async {
            self.isBluetoothOn = central.state == .poweredOn
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard let name = peripheral.name, !name.isEmpty else { return }

        if let address = UserDefaults.standard.string(forKey: "savedPrinterAddress"),
           peripheral.identifier.uuidString == address,
           pendingImageData != nil {
            centralManager.stopScan()
            discoveredPeripherals.append(peripheral)
            centralManager.connect(peripheral, options: nil)
            return
        }

        if !discoveredPeripherals.contains(where: { $0.identifier == peripheral.identifier }) {
            discoveredPeripherals.append(peripheral)
            DispatchQueue.main.async {
                self.discoveredDevices.append((name: name, identifier: peripheral.identifier))
            }
        }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        connectedPeripheral = peripheral
        connectedPeripheralName = peripheral.name
        peripheral.delegate = self
        peripheral.discoverServices(nil)
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        printCompletion?(false, "Failed to connect: \(error?.localizedDescription ?? "unknown")")
        printCompletion = nil
        pendingImageData = nil
    }

    // MARK: - CBPeripheralDelegate

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let services = peripheral.services else { return }
        for service in services {
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let characteristics = service.characteristics else { return }

        for char in characteristics {
            if char.properties.contains(.write) || char.properties.contains(.writeWithoutResponse) {
                writeCharacteristic = char
                sendPendingData(to: peripheral)
                return
            }
        }
    }

    private func sendPendingData(to peripheral: CBPeripheral) {
        guard let data = pendingImageData, let char = writeCharacteristic else {
            printCompletion?(false, "No writable characteristic found")
            printCompletion = nil
            pendingImageData = nil
            return
        }

        let chunkSize = 180
        var offset = 0

        func sendNext() {
            if offset >= data.count {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self.printCompletion?(true, nil)
                    self.printCompletion = nil
                    self.pendingImageData = nil
                    self.centralManager.cancelPeripheralConnection(peripheral)
                }
                return
            }

            let end = min(offset + chunkSize, data.count)
            let chunk = data[offset..<end]
            let writeType: CBCharacteristicWriteType = char.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse
            peripheral.writeValue(Data(chunk), for: char, type: writeType)
            offset = end

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) {
                sendNext()
            }
        }

        sendNext()
    }
}

// MARK: - Printer Setup View

struct PrinterSetupView: View {
    @ObservedObject var printerManager: BluetoothPrinterManager
    @Binding var savedPrinterName: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            if !printerManager.isBluetoothOn {
                Section {
                    HStack {
                        Image(systemName: "exclamationmark.triangle")
                            .foregroundStyle(Color.warningAmber)
                        Text("Turn on Bluetooth in Settings to connect a printer.")
                            .font(.subheadline)
                    }
                }
            } else {
                if let name = savedPrinterName {
                    Section("Current Printer") {
                        HStack {
                            Image(systemName: "printer.fill")
                                .foregroundStyle(Color.vairiotViolet)
                            Text(name)
                            Spacer()
                            Button("Remove") {
                                printerManager.removePrinter()
                                savedPrinterName = nil
                            }
                            .font(.caption)
                            .foregroundStyle(Color.errorRed)
                        }
                    }
                }

                Section("Available Devices") {
                    if printerManager.isScanning {
                        HStack {
                            ProgressView()
                            Text("Scanning for devices...")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .padding(.leading, 8)
                        }
                    }

                    ForEach(printerManager.discoveredDevices, id: \.identifier) { device in
                        Button {
                            printerManager.selectPrinter(name: device.name, identifier: device.identifier)
                            savedPrinterName = device.name
                            dismiss()
                        } label: {
                            HStack {
                                Image(systemName: "dot.radiowaves.left.and.right")
                                    .foregroundStyle(.secondary)
                                Text(device.name)
                                    .foregroundStyle(.primary)
                                Spacer()
                                if savedPrinterName == device.name {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(Color.vairiotViolet)
                                }
                            }
                        }
                    }

                    if printerManager.discoveredDevices.isEmpty && !printerManager.isScanning {
                        Text("No devices found. Make sure your printer is powered on and in pairing mode.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    Button {
                        if printerManager.isScanning {
                            printerManager.stopScanning()
                        } else {
                            printerManager.startScanning()
                        }
                    } label: {
                        Label(
                            printerManager.isScanning ? "Stop Scanning" : "Scan for Printers",
                            systemImage: printerManager.isScanning ? "stop.circle" : "arrow.clockwise"
                        )
                    }
                }
            }
        }
        .navigationTitle("Printer Setup")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") { dismiss() }
            }
        }
        .onAppear {
            if printerManager.isBluetoothOn {
                printerManager.startScanning()
            }
        }
    }
}
