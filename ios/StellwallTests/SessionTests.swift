import XCTest
@testable import Stellwall

@MainActor
final class SessionTests: XCTestCase {
    override func setUp() { StubProtocol.reset() }

    func testLoginSendsTheAppHeaderAndTheCredentialsAndKeepsTheCookie() async throws {
        let store = MemoryCookieStore()
        StubProtocol.enqueue("login-ok", headers: ["Set-Cookie": "sw_session=token-1; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax"])
        let me = try await StubProtocol.client(store).login(username: "alex", password: "correct-horse-1")
        XCTAssertEqual(me.username, "alex")
        XCTAssertEqual(me.mustChangePassword, false)
        let req = StubProtocol.requests[0]
        XCTAssertEqual(req.url?.path, "/api/auth/login")
        XCTAssertEqual(req.value(forHTTPHeaderField: "X-Stellwall"), "1")
        XCTAssertEqual(StubProtocol.bodyJSON(0) as? [String: String], ["username": "alex", "password": "correct-horse-1"])
        XCTAssertEqual(store.cookie, "token-1")
        StubProtocol.enqueue("me")
        _ = try await StubProtocol.client(store).me()
        XCTAssertEqual(StubProtocol.requests[1].value(forHTTPHeaderField: "Cookie"), "sw_session=token-1")
    }

    func testSignedOutMeIsNil() async throws {
        StubProtocol.enqueue("me-signed-out")
        let me = try await StubProtocol.client().me()
        XCTAssertNil(me)
    }

    func testErrorsReadLikeTheWebApp() {
        XCTAssertEqual(LoginText.error(APIError(status: 401, code: "invalid")), LoginText.invalid)
        XCTAssertEqual(LoginText.error(OfflineError()), LoginText.unreachable)
        XCTAssertEqual(LoginText.error(APIError(status: 429, code: "locked", until: "2026-11-27T10:15:00.000Z"), zone: TimeZone(identifier: "Europe/Berlin")!), LoginText.locked("11:15"))
    }

    func testAServerAddressGetsHttpsAndLosesItsPath() {
        XCTAssertEqual(ServerAddress.parse("wall.example.org")?.absoluteString, "https://wall.example.org/")
        XCTAssertEqual(ServerAddress.parse(" http://localhost:3999/x?y ")?.absoluteString, "http://localhost:3999/")
        XCTAssertNil(ServerAddress.parse("not a host"))
        XCTAssertNil(ServerAddress.parse(""))
        XCTAssertEqual(ServerAddress.shown("https://wall.example.org/"), "wall.example.org")
    }

    func testSigningInStoresTheAddressAndKeepsThePasswordUntilSignOut() async {
        let defaults = UserDefaults(suiteName: "test-\(UUID())")!
        let prefs = DevicePrefs(defaults)
        let model = AppModel(prefs: prefs, store: MemoryCookieStore(), clientFor: { url, store in APIClient(base: url, store: store, session: StubProtocol.session()) })
        StubProtocol.enqueue("login-ok")
        let error = await model.signIn(server: "wall.example.org", username: "alex", password: "pw-long-enough")
        XCTAssertNil(error)
        XCTAssertEqual(prefs.server, "https://wall.example.org/")
        XCTAssertEqual(model.signInPassword, "pw-long-enough")
        if case .signedIn = model.state {} else { XCTFail("not signed in") }
        StubProtocol.enqueue(status: 200, json: "{\"ok\":true}")
        await model.signOut()
        XCTAssertNil(model.signInPassword)
        XCTAssertEqual(model.state, .signedOut(server: "https://wall.example.org/"))
    }

    func testNoAnswerShowsUnreachable() async {
        let defaults = UserDefaults(suiteName: "test-\(UUID())")!
        let prefs = DevicePrefs(defaults)
        prefs.server = "https://wall.example.org/"
        StubProtocol.offline = true
        let model = AppModel(prefs: prefs, store: MemoryCookieStore(), clientFor: { url, store in APIClient(base: url, store: store, session: StubProtocol.session()) })
        await model.start()
        XCTAssertEqual(model.state, .unreachable)
    }

    func testTheSignInAndFirstPasswordScreens() {
        snap(LoginView(server: nil) { _, _, _ in nil }, named: "login")
        snap(FirstPasswordView(name: "Sam", known: nil, onSubmit: { _, _ in nil }, onSignOut: {}), world: "salbei", dark: true, named: "first-password-dark")
    }
}
