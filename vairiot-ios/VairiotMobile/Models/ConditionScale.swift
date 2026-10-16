import Foundation

/// One grade of the condition scale (GET /condition/scale, stage 1.15). Grade 5 is best.
struct ConditionScaleEntry: Codable, Equatable, Hashable {
    let grade: Int
    let label: String
    let criteria: String
    let colour: String
    var impairmentIndicator: Bool = false
    var photoRequired: Bool = false
}

struct ConditionScaleResponse: Codable {
    let source: String
    let entries: [ConditionScaleEntry]
}

extension ConditionScaleEntry {
    /// Mirrors vairiot-shared DEFAULT_CONDITION_SCALE, for use offline before the tenant's scale loads.
    static let defaultScale: [ConditionScaleEntry] = [
        .init(grade: 5, label: "Excellent", criteria: "As new. No visible wear or defects; fully functional.", colour: "#16a34a"),
        .init(grade: 4, label: "Good", criteria: "Minor wear only. Fully functional; routine maintenance.", colour: "#65a30d"),
        .init(grade: 3, label: "Fair", criteria: "Visible wear or minor damage. Functional; repair needed soon.", colour: "#d97706"),
        .init(grade: 2, label: "Poor", criteria: "Significant damage or deterioration. Partly functional; major repair needed.", colour: "#ea580c", impairmentIndicator: true, photoRequired: true),
        .init(grade: 1, label: "Unserviceable", criteria: "Not functional or unsafe. Replace or dispose.", colour: "#dc2626", impairmentIndicator: true, photoRequired: true),
    ]
}

extension APIEndpoint {
    static var getConditionScale: APIEndpoint {
        APIEndpoint(method: .get, path: "api/v1/condition/scale")
    }
}
