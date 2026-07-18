import SwiftUI

/// A password field with an eye button that toggles between hidden
/// (SecureField) and visible (TextField) without losing the entered text.
struct RevealableSecureField: View {
    let placeholder: String
    @Binding var text: String

    @State private var isRevealed = false
    @FocusState private var focus: Field?

    private enum Field { case secure, plain }

    var body: some View {
        HStack(spacing: 8) {
            Group {
                if isRevealed {
                    TextField(placeholder, text: $text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focus, equals: .plain)
                } else {
                    SecureField(placeholder, text: $text)
                        .focused($focus, equals: .secure)
                }
            }
            .textContentType(.password)

            Button {
                let wasFocused = focus != nil
                isRevealed.toggle()
                if wasFocused {
                    // Re-focus the replacement field after SwiftUI swaps them in.
                    DispatchQueue.main.async {
                        focus = isRevealed ? .plain : .secure
                    }
                }
            } label: {
                Image(systemName: isRevealed ? "eye.slash" : "eye")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isRevealed ? "Hide password" : "Show password")
        }
    }
}
