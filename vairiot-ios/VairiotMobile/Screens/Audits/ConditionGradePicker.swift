import SwiftUI

/// Condition grade for the next scan (stage 1.15): none or 1–5 from the
/// tenant's scale, with the chosen grade's criteria. Moved out of
/// AuditRunView, which is on the line-limit baseline.
struct ConditionGradePicker: View {
    let entries: [ConditionScaleEntry]
    @Binding var selected: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Condition (optional)")
                .font(.caption)
                .foregroundStyle(.secondary)
            Picker("Condition", selection: $selected) {
                Text("—").tag(Int?.none)
                ForEach(entries.sorted { $0.grade > $1.grade }, id: \.grade) { entry in
                    Text("\(entry.grade)").tag(Int?.some(entry.grade))
                }
            }
            .pickerStyle(.segmented)
            if let entry = entries.first(where: { $0.grade == selected }) {
                Text("\(entry.label): \(entry.criteria)\(entry.photoRequired ? " A photo is needed." : "")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
