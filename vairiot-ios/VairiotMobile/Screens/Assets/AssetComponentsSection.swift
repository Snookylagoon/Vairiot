import SwiftUI

/// An asset held as parts (stage 2.6, S2.2): the parent of a part, or a
/// parent's parts, each opening its own asset screen. Read-only; Finance
/// arranges parts on the web. Shown with the IPSAS ledger on.
struct AssetComponentsSection: View {
    let asset: AssetResponse
    let apiClient: APIClient

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let parent = asset.parentAsset {
                Text("Part of")
                    .font(.subheadline).fontWeight(.semibold).foregroundStyle(.secondary)
                    .padding(.bottom, 8).padding(.leading, 4)
                link(id: parent.id, text: "\(parent.assetNumber) \(parent.name)", icon: "arrow.turn.left.up")
            } else if let parts = asset.components, !parts.isEmpty {
                Text("Components (\(parts.count))")
                    .font(.subheadline).fontWeight(.semibold).foregroundStyle(.secondary)
                    .padding(.bottom, 8).padding(.leading, 4)
                VStack(spacing: 0) {
                    ForEach(parts) { part in
                        link(id: part.id, text: part.label, icon: "square.stack.3d.up")
                        if part.id != parts.last?.id { Divider().padding(.leading, 44) }
                    }
                }
            }
        }
    }

    private func link(id: String, text: String, icon: String) -> some View {
        NavigationLink {
            AssetDetailView(assetId: id, apiClient: apiClient)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon).foregroundStyle(Color.vairiotViolet).frame(width: 24)
                Text(text).font(.subheadline).foregroundStyle(.primary).multilineTextAlignment(.leading)
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
            }
            .padding(.vertical, 10).padding(.horizontal, 12)
        }
    }
}
