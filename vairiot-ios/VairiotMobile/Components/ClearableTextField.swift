import SwiftUI

/// A text field with an X button to clear, matching the Android `ClearableTextField`.
///
/// When the text is non-empty and the field is enabled, a circular X button
/// appears on the trailing edge. Uses Vairiot theme colours for the clear icon.
struct ClearableTextField: View {

    let placeholder: String
    @Binding var text: String
    var label: String?
    var leadingIcon: String?
    var keyboardType: UIKeyboardType = .default
    var textContentType: UITextContentType?
    var isEnabled: Bool = true
    var isReadOnly: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let label {
                Text(label)
                    .font(VairiotFont.caption())
                    .foregroundStyle(Color.vairiotCharcoal.opacity(0.7))
            }

            HStack(spacing: 8) {
                if let leadingIcon {
                    Image(systemName: leadingIcon)
                        .foregroundStyle(.secondary)
                        .frame(width: 20)
                }

                TextField(placeholder, text: $text)
                    .keyboardType(keyboardType)
                    .textContentType(textContentType)
                    .autocorrectionDisabled()
                    .disabled(!isEnabled || isReadOnly)

                if !text.isEmpty && isEnabled && !isReadOnly {
                    Button {
                        text = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color(.systemGray4), lineWidth: 1)
            )
            .opacity(isEnabled ? 1.0 : 0.6)
        }
    }
}
