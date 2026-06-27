import SwiftUI

/// Colored capsule badge for asset status or condition labels.
///
/// Supports both typed `AssetStatus` / `AssetCondition` enums and raw
/// label strings, picking the appropriate colour automatically.
struct StatusBadge: View {
    let text: String
    let color: Color

    // MARK: - Enum-based initialisers

    init(_ status: AssetStatus?) {
        switch status {
        case .active:      text = "Active";      color = .successGreen
        case .inactive:    text = "Inactive";    color = .gray
        case .inUse:       text = "In Use";      color = .blue
        case .maintenance: text = "Maintenance"; color = .warningAmber
        case .disposed:    text = "Disposed";    color = .errorRed
        case nil:          text = "Unknown";     color = .gray
        }
    }

    init(_ condition: AssetCondition?) {
        switch condition {
        case .new:     text = "New";     color = .successGreen
        case .good:    text = "Good";    color = .successGreen
        case .fair:    text = "Fair";    color = .warningAmber
        case .poor:    text = "Poor";    color = .errorRed
        case .damaged: text = "Damaged"; color = .errorRed
        case nil:      text = "Unknown"; color = .gray
        }
    }

    // MARK: - Label-string initialiser (auto-colour)

    /// Determines badge colour from a raw label string.
    ///
    /// Colour mapping:
    /// - Green: active, good, new
    /// - Amber: maintenance, fair
    /// - Red: disposed, damaged, poor, missing
    /// - Grey: inactive, anything else
    init(label: String) {
        self.text = label.capitalized
        switch label.lowercased() {
        case "active", "good", "new":
            self.color = .successGreen
        case "maintenance", "fair":
            self.color = .warningAmber
        case "disposed", "damaged", "poor", "missing":
            self.color = .errorRed
        case "inactive":
            self.color = .gray
        default:
            self.color = .gray
        }
    }

    // MARK: - Explicit text + colour

    init(text: String, color: Color) {
        self.text = text
        self.color = color
    }

    // MARK: - Body

    var body: some View {
        Text(text)
            .font(.caption2)
            .fontWeight(.semibold)
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color, in: Capsule())
    }
}
