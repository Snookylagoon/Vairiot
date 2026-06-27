import SwiftUI
import CoreImage.CIFilterBuiltins

struct LabelDesignView: View {

    // MARK: - Input

    let assetName: String
    let assetNumber: String
    let companyName: String
    let qrData: String

    // MARK: - State

    @State private var labelWidth: CGFloat = 300
    @State private var labelHeight: CGFloat = 150
    @State private var qrImage: UIImage?
    @State private var showShareSheet = false
    @State private var savedImageURL: URL?
    @State private var isPrinting = false
    @State private var errorMessage: String?

    // MARK: - Size Presets

    private enum LabelSize: String, CaseIterable, Identifiable {
        case small  = "Small"
        case medium = "Medium"
        case large  = "Large"

        var id: String { rawValue }

        var dimensions: (width: CGFloat, height: CGFloat) {
            switch self {
            case .small:  return (200, 100)
            case .medium: return (300, 150)
            case .large:  return (400, 200)
            }
        }
    }

    @State private var selectedSize: LabelSize = .medium

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                labelPreview

                sizeControls

                actionButtons
            }
            .padding()
        }
        .navigationTitle("Label Design")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
        .onAppear {
            qrImage = generateQRCode(from: qrData)
        }
        .onChange(of: selectedSize) { _, newSize in
            let dims = newSize.dimensions
            labelWidth = dims.width
            labelHeight = dims.height
        }
    }

    // MARK: - Label Preview

    private var labelPreview: some View {
        VStack(spacing: 8) {
            Text("Preview")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            labelContent
                .frame(width: labelWidth, height: labelHeight)
                .background(.white)
                .border(Color.gray.opacity(0.3), width: 1)
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
        }
    }

    private var labelContent: some View {
        HStack(spacing: 12) {
            // QR Code
            if let qrImage {
                Image(uiImage: qrImage)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(width: labelHeight * 0.7, height: labelHeight * 0.7)
            } else {
                Rectangle()
                    .fill(Color.gray.opacity(0.2))
                    .frame(width: labelHeight * 0.7, height: labelHeight * 0.7)
                    .overlay {
                        Image(systemName: "qrcode")
                            .foregroundStyle(.gray)
                    }
            }

            // Text content
            VStack(alignment: .leading, spacing: 4) {
                Text(assetName)
                    .font(.system(size: dynamicFontSize(for: labelHeight, base: 14)))
                    .fontWeight(.bold)
                    .foregroundStyle(.black)
                    .lineLimit(2)

                Text(assetNumber)
                    .font(.system(size: dynamicFontSize(for: labelHeight, base: 11)))
                    .foregroundStyle(.gray)

                Spacer()

                Text(companyName)
                    .font(.system(size: dynamicFontSize(for: labelHeight, base: 9)))
                    .foregroundStyle(.gray)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
        }
        .padding(.horizontal, 12)
    }

    // MARK: - Size Controls

    private var sizeControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Label Size")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)

            Picker("Size", selection: $selectedSize) {
                ForEach(LabelSize.allCases) { size in
                    Text(size.rawValue).tag(size)
                }
            }
            .pickerStyle(.segmented)

            HStack {
                Text("\(Int(labelWidth)) x \(Int(labelHeight)) pt")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Actions

    private var actionButtons: some View {
        VStack(spacing: 12) {
            Button {
                printLabel()
            } label: {
                Label("Print via AirPrint", systemImage: "printer")
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(.vairiotViolet)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            Button {
                saveAsImage()
            } label: {
                Label("Save as Image", systemImage: "square.and.arrow.down")
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .tint(.vairiotViolet)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - QR Code Generation

    private func generateQRCode(from string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()

        guard let data = string.data(using: .utf8) else { return nil }
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")

        guard let ciImage = filter.outputImage else { return nil }

        let scaleX = 300.0 / ciImage.extent.size.width
        let scaleY = 300.0 / ciImage.extent.size.height
        let scaled = ciImage.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    // MARK: - Render Label to Image

    private func renderLabelImage() -> UIImage? {
        let renderer = UIGraphicsImageRenderer(
            size: CGSize(width: labelWidth * 2, height: labelHeight * 2)
        )

        return renderer.image { ctx in
            let rect = CGRect(x: 0, y: 0, width: labelWidth * 2, height: labelHeight * 2)
            UIColor.white.setFill()
            ctx.fill(rect)

            let qrSize = labelHeight * 0.7 * 2
            let qrRect = CGRect(x: 24, y: (labelHeight * 2 - qrSize) / 2, width: qrSize, height: qrSize)

            if let qrImage {
                qrImage.draw(in: qrRect)
            }

            let textX = qrRect.maxX + 24
            let textWidth = labelWidth * 2 - textX - 24

            let nameFont = UIFont.boldSystemFont(ofSize: dynamicFontSize(for: labelHeight, base: 14) * 2)
            let numberFont = UIFont.systemFont(ofSize: dynamicFontSize(for: labelHeight, base: 11) * 2)
            let companyFont = UIFont.systemFont(ofSize: dynamicFontSize(for: labelHeight, base: 9) * 2)

            let nameAttr: [NSAttributedString.Key: Any] = [.font: nameFont, .foregroundColor: UIColor.black]
            let numberAttr: [NSAttributedString.Key: Any] = [.font: numberFont, .foregroundColor: UIColor.gray]
            let companyAttr: [NSAttributedString.Key: Any] = [.font: companyFont, .foregroundColor: UIColor.gray]

            let nameStr = NSString(string: assetName)
            let numberStr = NSString(string: assetNumber)
            let companyStr = NSString(string: companyName)

            var yPos: CGFloat = 16
            _ = CGRect(x: textX, y: yPos, width: textWidth, height: labelHeight * 2 - 32)

            nameStr.draw(
                with: CGRect(x: textX, y: yPos, width: textWidth, height: nameFont.lineHeight * 2),
                options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
                attributes: nameAttr,
                context: nil
            )
            yPos += nameFont.lineHeight * 2 + 8

            numberStr.draw(
                with: CGRect(x: textX, y: yPos, width: textWidth, height: numberFont.lineHeight),
                options: [.usesLineFragmentOrigin],
                attributes: numberAttr,
                context: nil
            )

            let companyY = rect.height - companyFont.lineHeight - 16
            companyStr.draw(
                with: CGRect(x: textX, y: companyY, width: textWidth, height: companyFont.lineHeight),
                options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
                attributes: companyAttr,
                context: nil
            )
        }
    }

    // MARK: - Print

    private func printLabel() {
        guard let image = renderLabelImage() else {
            errorMessage = "Failed to render label for printing"
            return
        }

        let printController = UIPrintInteractionController.shared
        let printInfo = UIPrintInfo(dictionary: nil)
        printInfo.jobName = "Vairiot Label - \(assetNumber)"
        printInfo.outputType = .photo
        printController.printInfo = printInfo
        printController.printingItem = image

        printController.present(animated: true) { _, completed, error in
            if let error {
                errorMessage = "Print failed: \(error.localizedDescription)"
            }
        }
    }

    // MARK: - Save

    private func saveAsImage() {
        guard let image = renderLabelImage() else {
            errorMessage = "Failed to render label image"
            return
        }

        UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
    }

    // MARK: - Helpers

    private func dynamicFontSize(for height: CGFloat, base: CGFloat) -> CGFloat {
        let scale = height / 150.0
        return base * scale
    }
}
