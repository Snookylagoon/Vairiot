import SwiftUI

struct LoadingButton: View {
    let title: String
    let isLoading: Bool
    let backgroundColor: Color
    let foregroundColor: Color
    let action: () -> Void

    init(
        title: String,
        isLoading: Bool,
        backgroundColor: Color = .vairiotViolet,
        foregroundColor: Color = .white,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.isLoading = isLoading
        self.backgroundColor = backgroundColor
        self.foregroundColor = foregroundColor
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(foregroundColor)
                }
                Text(isLoading ? "" : title)
                    .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity, minHeight: 22)
        }
        .buttonStyle(.borderedProminent)
        .tint(backgroundColor)
        .foregroundStyle(foregroundColor)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .disabled(isLoading)
    }
}
