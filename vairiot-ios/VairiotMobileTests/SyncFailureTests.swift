import XCTest
@testable import VairiotMobile

final class SyncFailureTests: XCTestCase {

    private func kind(_ error: Error) -> SyncFailureKind { classifySyncFailure(error).kind }

    func testNoConnectivityAndTimeoutsAreNetworkErrors() {
        XCTAssertEqual(kind(offline), .network)
        XCTAssertEqual(kind(timedOut), .network)
        XCTAssertEqual(kind(URLError(.cancelled)), .network)
    }

    func testServerErrorsAndThrottlingAreTransient() {
        for status in [500, 502, 503, 504] { XCTAssertEqual(kind(APIError.serverError(status)), .transient) }
        XCTAssertEqual(kind(rejected(408)), .transient)
        XCTAssertEqual(kind(rejected(429)), .transient)
    }

    func test401PausesForSignIn() {
        XCTAssertEqual(kind(APIError.unauthorized), .auth)
    }

    func testOther4xxArePermanentIncluding403() {
        XCTAssertEqual(kind(APIError.forbidden), .permanent)
        XCTAssertEqual(kind(APIError.notFound), .permanent)
        for status in [400, 413, 415, 422] { XCTAssertEqual(kind(rejected(status)), .permanent) }
    }

    func test409IsOnlySuccessWhenItSaysTheRecordExists() {
        XCTAssertEqual(kind(rejected(409, "Already recorded", code: "DUPLICATE_REQUEST")), .duplicate)
        // The API's real 409s are rejections; success would delete a scan it never stored.
        XCTAssertEqual(kind(rejected(409, "Campaign is not in progress", code: "CAMPAIGN_NOT_ACTIVE")), .permanent)
        XCTAssertEqual(kind(rejected(409, "Zone locked", code: "ZONE_LOCKED")), .permanent)
    }

    func testServerMessageIsKeptForTheUser() {
        let failure = classifySyncFailure(
            rejected(400, "Blind campaigns require a locationId with each scan", code: "VALIDATION_ERROR")
        )
        XCTAssertEqual(failure.message, "HTTP 400: Blind campaigns require a locationId with each scan")
    }

    func testUnsendableRowIsPermanent() {
        XCTAssertEqual(kind(UnsendableError(message: "Photo file is missing")), .permanent)
    }

    func testUnexpectedClientErrorsAreRetriedNotDropped() {
        XCTAssertEqual(kind(APIError.decodingError(URLError(.cannotParseResponse))), .transient)
    }
}
