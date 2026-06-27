import Foundation

// MARK: - ISO 8601 Parsing

extension Date {

    /// Parses an ISO 8601 date string from the API.
    /// Handles both fractional seconds and plain ISO formats.
    static func fromISO(_ string: String?) -> Date? {
        guard let string, !string.isEmpty else { return nil }

        // Try with fractional seconds first (most common from API)
        if let date = ISO8601Formatter.withFractional.date(from: string) {
            return date
        }
        // Fall back to standard ISO 8601
        if let date = ISO8601Formatter.standard.date(from: string) {
            return date
        }
        // Last resort: DateFormatter for other variants
        return ISO8601Formatter.fallback.date(from: string)
    }
}

// MARK: - Display Formatting

extension Date {

    /// "27 Jun 2026 at 14:32"
    func displayString() -> String {
        DateFormatters.display.string(from: self)
    }

    /// "27 Jun 2026"
    func dateOnlyString() -> String {
        DateFormatters.dateOnly.string(from: self)
    }

    /// "14:32"
    func timeOnlyString() -> String {
        DateFormatters.timeOnly.string(from: self)
    }

    /// Relative time: "just now", "2 hours ago", "yesterday", "3 days ago",
    /// or falls back to the display format for older dates.
    func relativeString() -> String {
        let now = Date()
        let interval = now.timeIntervalSince(self)

        guard interval >= 0 else {
            return displayString()
        }

        let seconds = Int(interval)
        let minutes = seconds / 60
        let hours = minutes / 60
        let days = hours / 24

        switch seconds {
        case 0..<60:
            return "just now"
        case 60..<3600:
            return minutes == 1 ? "1 minute ago" : "\(minutes) minutes ago"
        case 3600..<86400:
            return hours == 1 ? "1 hour ago" : "\(hours) hours ago"
        case 86400..<172800:
            return "yesterday"
        case 172800..<604800:
            return "\(days) days ago"
        default:
            return displayString()
        }
    }
}

// MARK: - String Convenience

extension String {

    /// Parse this string as an ISO 8601 date and return a display string.
    /// Returns the original string if parsing fails.
    func toDisplayDate() -> String {
        Date.fromISO(self)?.displayString() ?? self
    }

    /// Parse this string as an ISO 8601 date and return a relative time string.
    func toRelativeDate() -> String {
        Date.fromISO(self)?.relativeString() ?? self
    }
}

// MARK: - Private Formatters (cached)

private enum ISO8601Formatter {
    static let withFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static let standard: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static let fallback: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        return f
    }()
}

private enum DateFormatters {
    /// "27 Jun 2026 at 14:32"
    static let display: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "d MMM yyyy 'at' HH:mm"
        f.locale = Locale(identifier: "en_GB")
        return f
    }()

    /// "27 Jun 2026"
    static let dateOnly: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "d MMM yyyy"
        f.locale = Locale(identifier: "en_GB")
        return f
    }()

    /// "14:32"
    static let timeOnly: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        f.locale = Locale(identifier: "en_GB")
        return f
    }()
}
