import UIKit

// Swift port of the web designer's computeLabelElements() (labelLayout.ts) —
// the same engine now also ported to Android (LabelRenderer.kt). All geometry
// is computed at 1× label px (96 dpi, mm × 3.7795) so a saved template renders
// identically here, on Android, and in the web preview/print. The company-logo
// element is not rendered on mobile (no logo asset on device); everything else
// — element order, auto layout, freeform `layout` overrides, per-field
// `styles`, fixed `barcodeMm`, monochrome — matches the web.

enum LabelLayout {

    static let mmToPx: CGFloat = 3.7795275591   // 96 dpi
    /// Smallest reliably scannable 2D symbol on a printed label (mm).
    static let minBarcodeMm: CGFloat = 12

    struct Element {
        let key: String
        let kind: Kind              // barcode | text
        var text: String = ""
        var font: CGFloat = 0
        var bold = false
        var italic = false
        var color: UIColor = .black
        var x: CGFloat
        var y: CGFloat
        var w: CGFloat
        var h: CGFloat

        enum Kind { case barcode, text }
    }

    struct Input {
        let asset: AssetResponse
        let company: CompanyResponse?
        let gs1: Gs1EncodingResponse?
        let fields: ContentFields
        let is2D: Bool
        let widthPx: CGFloat        // label width at 1× (mm × mmToPx)
        let heightPx: CGFloat
        let layout: [String: LabelLayoutPosition]?
        let styles: [String: LabelTextStyleOverride]?
        let barcodeMm: CGFloat?
        let monochrome: Bool
    }

    private struct Line {
        let key: String
        let text: String
        let kind: String            // title | number | brand | muted
    }

    private static func color(for kind: String, monochrome: Bool) -> UIColor {
        if monochrome { return .black }
        switch kind {
        case "title", "brand": return UIColor(red: 0x2B/255, green: 0x31/255, blue: 0x32/255, alpha: 1)
        case "number":         return UIColor(red: 0x61/255, green: 0x5A/255, blue: 0xA0/255, alpha: 1)
        default:               return UIColor(red: 0x6B/255, green: 0x72/255, blue: 0x80/255, alpha: 1)
        }
    }

    private static func buildLines(_ input: Input) -> [Line] {
        let asset = input.asset
        let fields = input.fields
        let company = input.company
        var lines: [Line] = []
        if fields.name { lines.append(Line(key: "name", text: asset.name, kind: "title")) }
        if fields.assetNumber { lines.append(Line(key: "assetNumber", text: asset.assetNumber, kind: "number")) }
        // GS1 identifier line — the HRI carries the tenant mark so identifiers
        // stay distinguishable across tenants (replaces the legacy BC: line).
        if fields.barcode {
            if let gs1 = input.gs1 {
                lines.append(Line(key: "iar", text: gs1.hri, kind: "number"))
            } else if let bc = asset.barcode, !bc.isEmpty {
                lines.append(Line(key: "barcodeValue", text: "BC: \(bc)", kind: "muted"))
            }
        }
        if fields.serialNumber, let sn = asset.serialNumber, !sn.isEmpty {
            lines.append(Line(key: "serialNumber", text: "SN: \(sn)", kind: "muted"))
        }
        if fields.site, let site = asset.site?.name { lines.append(Line(key: "site", text: site, kind: "muted")) }
        if fields.category, let cat = asset.category?.name { lines.append(Line(key: "category", text: cat, kind: "muted")) }
        if fields.companyName, let co = company, let name = co.tradingName ?? co.legalName, !name.isEmpty {
            lines.append(Line(key: "companyName", text: name, kind: "brand"))
        }
        if fields.companyAddress, let co = company {
            let addr = [co.addressLine1, co.addressLine2, co.city, co.stateProvince, co.postalCode, co.country]
                .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
            if !addr.isEmpty { lines.append(Line(key: "companyAddress", text: addr, kind: "muted")) }
        }
        if fields.companyEmail, let email = company?.primaryContactEmail, !email.isEmpty {
            lines.append(Line(key: "companyEmail", text: email, kind: "muted"))
        }
        return lines
    }

    static func computeElements(_ input: Input) -> [Element] {
        let widthPx = input.widthPx
        let heightPx = input.heightPx
        let wide2D = input.is2D

        let padding = max(3, (min(widthPx, heightPx) * 0.04).rounded())
        let innerW = widthPx - padding * 2
        let innerH = heightPx - padding * 2
        let gap = max(2, (innerW * 0.015).rounded())

        let lines = buildLines(input)

        // Barcode geometry — a fixed template size (≥12 mm) wins over the heuristic.
        let longestTitle = lines.filter { $0.kind == "title" }.map { $0.text.count }.max() ?? 0
        let longestOther = lines.filter { $0.kind != "title" }.map { $0.text.count }.max() ?? 0
        let minFont: CGFloat = 5
        let minTextW = max(CGFloat(longestTitle) * 0.62 * minFont, CGFloat(longestOther) * 0.58 * (minFont * 0.82))
        let bcIdeal = min(innerH, innerW - minTextW - gap)
        let bcMin = (innerH * 0.3).rounded()
        let bcSize2D: CGFloat
        if let fixedMm = input.barcodeMm {
            bcSize2D = min(max(fixedMm, minBarcodeMm) * mmToPx, min(innerW, innerH)).rounded()
        } else {
            bcSize2D = max(bcMin, min(innerH, bcIdeal)).rounded()
        }
        let bc1DH = min((innerH * 0.35).rounded(), 50)
        let textAreaW = wide2D ? innerW - bcSize2D - gap : innerW

        // Font sizing. With a custom template layout, fonts derive from the label
        // geometry alone so every asset's label matches the template; automatic
        // layout keeps the classic per-asset auto-fit.
        let titleFont: CGFloat
        let otherFont: CGFloat
        if input.layout != nil {
            titleFont = max(5, min(14, (innerH * 0.13).rounded()))
            otherFont = max(4, (titleFont * 0.82).rounded())
        } else {
            let maxFontByTitleW = longestTitle > 0 ? textAreaW / (CGFloat(longestTitle) * 0.62) : 99
            let maxFontByOtherW = longestOther > 0 ? textAreaW / (CGFloat(longestOther) * 0.58) : 99
            let maxFontByW = min(maxFontByTitleW, maxFontByOtherW / 0.82)
            let totalWeight = lines.reduce(CGFloat(0)) { $0 + ($1.kind == "title" ? 1 : 0.82) }
            let textAreaH = wide2D ? innerH : innerH - bc1DH - 2
            let maxFontByH = totalWeight > 0 ? textAreaH / (totalWeight * 1.15) : 12
            let fontSize = max(3, min(maxFontByH, min(maxFontByW, 14)))
            titleFont = fontSize
            otherFont = max(3, (fontSize * 0.82).rounded())
        }

        var elements: [Element] = []

        if wide2D {
            elements.append(Element(key: "barcode", kind: .barcode,
                x: padding, y: padding + max(0, (innerH - bcSize2D) / 2),
                w: bcSize2D, h: bcSize2D))
        } else {
            elements.append(Element(key: "barcode", kind: .barcode,
                x: padding, y: heightPx - padding - bc1DH,
                w: innerW, h: bc1DH))
        }

        // Text stack, vertically centred in its area; explicit style overrides
        // win over the auto style.
        let styles = input.styles ?? [:]
        struct Styled { let line: Line; let font: CGFloat; let bold: Bool; let italic: Bool }
        let styledLines = lines.map { l -> Styled in
            let s = styles[l.key]
            return Styled(
                line: l,
                font: s?.font.map { CGFloat($0) } ?? (l.kind == "title" ? titleFont : otherFont),
                bold: s?.bold ?? (l.kind == "title"),
                italic: s?.italic ?? false
            )
        }

        let textX = wide2D ? padding + bcSize2D + gap : padding
        let stackH = styledLines.reduce(CGFloat(0)) { $0 + $1.font * 1.15 }
        let availH = wide2D ? innerH : innerH - bc1DH - 2
        var y = padding + max(0, (availH - stackH) / 2)

        for s in styledLines {
            let estW = min(textAreaW, CGFloat(s.line.text.count) * (s.line.kind == "title" ? 0.62 : 0.58) * s.font)
            elements.append(Element(
                key: s.line.key, kind: .text, text: s.line.text,
                font: s.font, bold: s.bold, italic: s.italic,
                color: color(for: s.line.kind, monochrome: input.monochrome),
                x: textX, y: y, w: max(4, estW), h: s.font * 1.15))
            y += s.font * 1.15
        }

        // Freeform overrides: fractional top-left positions, clamped on-label.
        if let layout = input.layout {
            for i in elements.indices {
                guard let pos = layout[elements[i].key],
                      let px = pos.x, let py = pos.y else { continue }
                elements[i].x = min(max(0, CGFloat(px) * widthPx), max(0, widthPx - elements[i].w))
                elements[i].y = min(max(0, CGFloat(py) * heightPx), max(0, heightPx - elements[i].h))
            }
        }

        return elements
    }

    /// Renders the computed elements to a bitmap at `scale`× the 1× layout px.
    /// Matches the web canvas renderer: text draws with its baseline at
    /// top + font size, barcodes upscale without smoothing.
    static func render(_ input: Input, barcodeImage: UIImage?, scale: CGFloat = 4) -> UIImage {
        let w = input.widthPx * scale
        let h = input.heightPx * scale
        let elements = computeElements(input)

        let renderer = UIGraphicsImageRenderer(size: CGSize(width: w, height: h))
        return renderer.image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
            ctx.cgContext.interpolationQuality = .none

            for el in elements {
                switch el.kind {
                case .barcode:
                    barcodeImage?.draw(in: CGRect(
                        x: el.x * scale, y: el.y * scale,
                        width: el.w * scale, height: el.h * scale))
                case .text:
                    guard !el.text.isEmpty else { continue }
                    let fs = el.font * scale
                    var font = el.bold ? UIFont.boldSystemFont(ofSize: fs) : UIFont.systemFont(ofSize: fs)
                    if el.italic, let desc = font.fontDescriptor.withSymbolicTraits(
                        font.fontDescriptor.symbolicTraits.union(.traitItalic)) {
                        font = UIFont(descriptor: desc, size: fs)
                    }
                    let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: el.color]
                    // Web canvas anchors the baseline at top + font size.
                    let baselineY = el.y * scale + fs
                    NSString(string: el.text).draw(
                        at: CGPoint(x: el.x * scale, y: baselineY - font.ascender),
                        withAttributes: attrs)
                }
            }
        }
    }
}
