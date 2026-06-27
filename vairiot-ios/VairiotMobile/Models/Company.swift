import Foundation

struct CompanyResponse: Codable {
    let id: String
    let legalName: String?
    let tradingName: String?
    let addressLine1: String?
    let addressLine2: String?
    let city: String?
    let stateProvince: String?
    let postalCode: String?
    let country: String?
    let primaryContactEmail: String?
}
