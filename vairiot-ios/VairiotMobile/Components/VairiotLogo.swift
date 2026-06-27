import SwiftUI

struct VairiotLogo: View {
    var size: CGFloat = 64

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 6.0 / 32.0)
                .fill(
                    LinearGradient(
                        colors: [.vairiotPink, .vairiotMauve, .vairiotViolet],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )

            VShape()
                .fill(.white)
                .padding(size * 3.0 / 32.0)
        }
        .frame(width: size, height: size)
    }
}

private struct VShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width
        let h = rect.height

        var path = Path()
        path.move(to: CGPoint(x: w * 0.02, y: 0))
        path.addLine(to: CGPoint(x: w * 0.27, y: 0))
        path.addLine(to: CGPoint(x: w * 0.50, y: h * 0.70))
        path.addLine(to: CGPoint(x: w * 0.73, y: 0))
        path.addLine(to: CGPoint(x: w * 0.98, y: 0))
        path.addLine(to: CGPoint(x: w * 0.60, y: h))
        path.addLine(to: CGPoint(x: w * 0.40, y: h))
        path.closeSubpath()
        return path
    }
}
