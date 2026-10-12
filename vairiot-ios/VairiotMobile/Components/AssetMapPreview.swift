import MapKit
import SwiftUI

/// Non-interactive map with a marker (and accuracy circle, when known) at an
/// asset's position. Tapping opens Apple Maps.
struct AssetMapPreview: View {
    let position: AssetPosition
    var title: String = "Asset"
    var height: CGFloat = 180

    @Environment(\.openURL) private var openURL

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: position.latitude, longitude: position.longitude)
    }

    var body: some View {
        Map(initialPosition: .region(MKCoordinateRegion(
            center: coordinate,
            latitudinalMeters: max(250, (position.accuracyMeters ?? 0) * 6),
            longitudinalMeters: max(250, (position.accuracyMeters ?? 0) * 6)
        ))) {
            if let accuracy = position.accuracyMeters, accuracy > 0 {
                MapCircle(center: coordinate, radius: accuracy)
                    .foregroundStyle(Color.vairiotViolet.opacity(0.15))
                    .stroke(Color.vairiotViolet.opacity(0.5), lineWidth: 1)
            }
            Marker(title, coordinate: coordinate)
                .tint(Color.vairiotViolet)
        }
        // A fresh map per position, so a recapture recentres it.
        .id(position)
        .allowsHitTesting(false)
        .overlay {
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    if let url = position.appleMapsURL { openURL(url) }
                }
        }
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityLabel("Map showing \(title) at \(position.coordinateText). Opens in Maps.")
        .accessibilityAddTraits(.isButton)
    }
}
