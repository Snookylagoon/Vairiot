import SwiftUI

// Brand colours are defined in VairiotColors.swift.
// Only vairiotMauve (gradient midpoint) lives here because it is
// used exclusively by theme components.

extension Color {
    static let vairiotMauve = Color(red: 160.0 / 255.0, green: 91.0 / 255.0, blue: 151.0 / 255.0)
}

// MARK: - Gradient

extension LinearGradient {
    static let vairiotBrand = LinearGradient(
        colors: [.vairiotPink, .vairiotViolet],
        startPoint: .leading,
        endPoint: .trailing
    )

    static let vairiotVertical = LinearGradient(
        colors: [.vairiotPink, .vairiotViolet],
        startPoint: .top,
        endPoint: .bottom
    )
}

// MARK: - Typography

enum VairiotFont {
    /// Attempts to use Montserrat if available, falls back to system rounded font.
    static func heading(_ size: CGFloat = 22) -> Font {
        if let _ = UIFont(name: "Montserrat-Bold", size: size) {
            return .custom("Montserrat-Bold", size: size)
        }
        return .system(size: size, weight: .bold, design: .rounded)
    }

    static func subheading(_ size: CGFloat = 17) -> Font {
        if let _ = UIFont(name: "Montserrat-SemiBold", size: size) {
            return .custom("Montserrat-SemiBold", size: size)
        }
        return .system(size: size, weight: .semibold, design: .rounded)
    }

    static func body(_ size: CGFloat = 15) -> Font {
        if let _ = UIFont(name: "Montserrat-Regular", size: size) {
            return .custom("Montserrat-Regular", size: size)
        }
        return .system(size: size, weight: .regular, design: .rounded)
    }

    static func caption(_ size: CGFloat = 13) -> Font {
        if let _ = UIFont(name: "Montserrat-Regular", size: size) {
            return .custom("Montserrat-Regular", size: size)
        }
        return .system(size: size, weight: .regular, design: .rounded)
    }

    static func mono(_ size: CGFloat = 14) -> Font {
        .system(size: size, weight: .regular, design: .monospaced)
    }
}

// MARK: - View Modifiers

struct VairiotCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding()
            .background(Color(.systemBackground))
            .cornerRadius(12)
            .shadow(color: .black.opacity(0.06), radius: 4, x: 0, y: 2)
    }
}

struct VairiotPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(VairiotFont.subheading(16))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                configuration.isPressed
                    ? LinearGradient(colors: [.vairiotMauve, .vairiotViolet], startPoint: .leading, endPoint: .trailing)
                    : LinearGradient.vairiotBrand
            )
            .cornerRadius(10)
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

struct VairiotSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(VairiotFont.subheading(16))
            .foregroundColor(.vairiotPink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color.vairiotWash)
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.vairiotPink.opacity(0.3), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - View Extensions

extension View {
    func vairiotCard() -> some View {
        modifier(VairiotCardModifier())
    }

    func vairiotNavigationBar() -> some View {
        self
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(Color.vairiotCharcoal, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
    }
}

// MARK: - Status Badge Colors

extension Color {
    static func forAssetStatus(_ status: String) -> Color {
        switch status {
        case "active":      return .successGreen
        case "inactive":    return .gray
        case "in_use":      return .vairiotViolet
        case "maintenance": return .warningAmber
        case "disposed":    return .errorRed
        default:            return .gray
        }
    }

    static func forCondition(_ condition: String) -> Color {
        switch condition {
        case "new":     return .successGreen
        case "good":    return .vairiotViolet
        case "fair":    return .warningAmber
        case "poor":    return .orange
        case "damaged": return .errorRed
        default:        return .gray
        }
    }
}
