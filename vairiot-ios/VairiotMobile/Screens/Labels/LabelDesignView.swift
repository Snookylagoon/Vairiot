import SwiftUI
import CoreImage.CIFilterBuiltins
import CoreBluetooth

// MARK: - Content Field Toggles

struct ContentFields {
    var name = true
    var assetNumber = true
    var serialNumber = true
    var barcode = false
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
    case code39 = "Code 39"
    case pdf417 = "PDF417"

    var id: String { rawValue }

    var is2D: Bool {
        switch self {
        case .qr, .pdf417: return true
        case .code128, .code39: return false
        }
    }
}

// MARK: - Label Size Preset

enum LabelSizePreset: String, CaseIterable, Identifiable {
    case avery5167 = "Avery 5167"
    case avery6570 = "Avery 6570"
    case avery5160 = "Avery 5160"
    case averyL7651 = "Avery L7651 EU"
    case averyL7159 = "Avery L7159 EU"
    case avery5163 = "Avery 5163"
    case averyL7163 = "Avery L7163 EU"

    var id: String { rawValue }

    var dimensions: (width: CGFloat, height: CGFloat) {
        switch self {
        case .avery5167:  return (178, 51)
        case .avery6570:  return (127, 76)
        case .avery5160:  return (267, 102)
        case .averyL7651: return (152, 85)
        case .averyL7159: return (254, 152)
        case .avery5163:  return (406, 203)
        case .averyL7163: return (396, 152)
        }
    }

    var label: String {
        let d = dimensions
        return "\(rawValue) — \(Int(d.width/4))×\(Int(d.height/4))mm"
    }
}

// MARK: - Label Design View

struct LabelDesignView: View {

    let asset: AssetResponse
    let apiClient: APIClient

    @State private var fields = ContentFields()
    @State private var selectedSize: LabelSizePreset = .averyL7651
    @State private var selectedBarcode: BarcodeStandard = .qr

    @State private var company: CompanyResponse?
    @State private var isLoadingCompany = true

    @State private var showPrinterSetup = false
    @State private var isPrinting = false
    @State private var statusMessage: String?
    @State private var statusIsError = false

    @State private var bluetoothPrinter: BluetoothPrinterManager?
    @State private var savedPrinterName: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                previewSection
                barcodePicker
                sizePicker
                fieldToggles
                printerSection
            }
            .padding()
        }
        .safeAreaInset(edge: .bottom) {
            printButton
        }
        .navigationTitle("Label Design")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    saveAsImage()
                } label: {
                    Image(systemName: "square.and.arrow.down")
                }
            }
        }
        .task {
            await loadCompany()
            bluetoothPrinter = BluetoothPrinterManager()
            savedPrinterName = UserDefaults.standard.string(forKey: "savedPrinterName")
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

    // MARK: - Preview

    private var previewSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Preview")

            let dims = selectedSize.dimensions
            let scale = min((UIScreen.main.bounds.width - 32) / dims.width, 1.5)

            labelContent
                .frame(width: dims.width * scale, height: dims.height * scale)
                .background(.white)
                .border(Color.gray.opacity(0.3), width: 1)
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
                .frame(maxWidth: .infinity)
        }
    }

    private var labelContent: some View {
        let dims = selectedSize.dimensions
        let scale = min((UIScreen.main.bounds.width - 32) / dims.width, 1.5)
        let pad = dims.height * scale * 0.08

        return GeometryReader { geo in
            if selectedBarcode.is2D {
                HStack(alignment: .center, spacing: 0) {
                    let barcodeSize = min(geo.size.height - pad * 2, geo.size.width * 0.35)
                    barcodeImage
                        .frame(width: barcodeSize, height: barcodeSize)

                    Spacer().frame(width: geo.size.width * 0.04)

                    textFields(fontSize: dynamicFontSize(for: dims.height * scale))
                }
                .padding(.horizontal, geo.size.width * 0.04)
                .padding(.vertical, pad)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(spacing: 2) {
                    textFields(fontSize: dynamicFontSize(for: dims.height * scale * 0.65))

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
            if fields.barcode, let bc = asset.barcode, !bc.isEmpty {
                Text("BC: \(bc)")
                    .font(.system(size: fontSize * 0.82))
                    .foregroundStyle(.gray)
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

    // MARK: - Barcode Picker

    private var barcodePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Barcode Standard")

            Picker("Barcode", selection: $selectedBarcode) {
                ForEach(BarcodeStandard.allCases) { bc in
                    Text(bc.rawValue).tag(bc)
                }
            }
            .pickerStyle(.menu)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    // MARK: - Size Picker

    private var sizePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Label Size")

            Picker("Size", selection: $selectedSize) {
                ForEach(LabelSizePreset.allCases) { size in
                    Text(size.label).tag(size)
                }
            }
            .pickerStyle(.menu)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    // MARK: - Field Toggles

    private var fieldToggles: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Show on Label")

            VStack(spacing: 0) {
                fieldToggle("Asset Name", isOn: $fields.name)
                Divider().padding(.horizontal)
                fieldToggle("Asset Number", isOn: $fields.assetNumber)
                Divider().padding(.horizontal)
                fieldToggle("Serial Number", isOn: $fields.serialNumber)
                Divider().padding(.horizontal)
                fieldToggle("Barcode", isOn: $fields.barcode)
                Divider().padding(.horizontal)
                fieldToggle("Site", isOn: $fields.site)
                Divider().padding(.horizontal)
                fieldToggle("Category", isOn: $fields.category)
                Divider().padding(.horizontal)
                fieldToggle("Company Name", isOn: $fields.companyName)
                Divider().padding(.horizontal)
                fieldToggle("Company Address", isOn: $fields.companyAddress)
                Divider().padding(.horizontal)
                fieldToggle("Company Email", isOn: $fields.companyEmail)
            }
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func fieldToggle(_ label: String, isOn: Binding<Bool>) -> some View {
        Toggle(label, isOn: isOn)
            .font(.subheadline)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .tint(.vairiotViolet)
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
            .disabled(isPrinting)

            if savedPrinterName != nil {
                Button {
                    printViaAirPrint()
                } label: {
                    Label("AirPrint", systemImage: "printer")
                        .font(.subheadline)
                }
                .tint(.secondary)
            }
        }
        .padding()
        .background(.ultraThinMaterial)
    }

    // MARK: - Barcode Generation

    private func barcodePayload() -> String {
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
        case .code128:  filterName = "CICode128BarcodeGenerator"
        case .pdf417:   filterName = "CIPDF417BarcodeGenerator"
        case .code39:
            return generateCode39Image(from: string)
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

    private func generateCode39Image(from string: String) -> UIImage? {
        let context = CIContext()
        guard let filter = CIFilter(name: "CICode128BarcodeGenerator"),
              let data = string.data(using: .ascii) else { return nil }
        filter.setValue(data, forKey: "inputMessage")
        guard let ciImage = filter.outputImage else { return nil }
        let scaleX = 300.0 / ciImage.extent.size.width
        let scaleY = 80.0 / ciImage.extent.size.height
        let scaled = ciImage.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    // MARK: - Render Label

    private func renderLabelImage() -> UIImage? {
        let dims = selectedSize.dimensions
        let renderScale: CGFloat = 3
        let w = dims.width * renderScale
        let h = dims.height * renderScale

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
        let dims = selectedSize.dimensions
        let baseFontSize = dynamicFontSize(for: dims.height) * renderScale
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
        if fields.barcode, let bc = asset.barcode, !bc.isEmpty { lines.append(("BC: \(bc)", bodyAttr)) }
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

    // MARK: - Print Actions

    private func printViaAirPrint() {
        guard let image = renderLabelImage() else {
            showStatus("Failed to render label", isError: true)
            return
        }

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

        isPrinting = true
        printer.printImage(image, toAddress: address) { success, error in
            DispatchQueue.main.async {
                isPrinting = false
                if success {
                    showStatus("Label sent to printer", isError: false)
                } else {
                    showStatus(error ?? "Print failed", isError: true)
                }
            }
        }
    }

    private func saveAsImage() {
        guard let image = renderLabelImage() else {
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
        let scale = height / 150.0
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

    func printImage(_ image: UIImage, toAddress address: String, completion: @escaping (Bool, String?) -> Void) {
        guard let uuid = UUID(uuidString: address) else {
            completion(false, "Invalid printer address")
            return
        }

        guard let peripheral = discoveredPeripherals.first(where: { $0.identifier == uuid }) else {
            printCompletion = completion
            pendingImageData = convertToESCPOS(image)
            centralManager.scanForPeripherals(withServices: nil, options: nil)
            DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
                if self?.connectedPeripheral == nil {
                    self?.centralManager.stopScan()
                    completion(false, "Printer not found. Make sure it is powered on.")
                }
            }
            return
        }

        pendingImageData = convertToESCPOS(image)
        printCompletion = completion
        centralManager.connect(peripheral, options: nil)
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

        let bytesPerRow = (w + 7) / 8
        for stripStart in stride(from: 0, to: h, by: 24) {
            escpos.append(contentsOf: [0x1B, 0x2A, 33])
            escpos.append(UInt8(bytesPerRow & 0xFF))
            escpos.append(UInt8((bytesPerRow >> 8) & 0xFF))

            for x in 0..<bytesPerRow * 8 {
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
