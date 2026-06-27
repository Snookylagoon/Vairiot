import SwiftUI

/// Centered loading spinner with an optional message.
struct LoadingView: View {

    var message: String?

    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .progressViewStyle(.circular)
                .tint(.vairiotViolet)
                .scaleEffect(1.2)

            if let message {
                Text(message)
                    .font(VairiotFont.body())
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
