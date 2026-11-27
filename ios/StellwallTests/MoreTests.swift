import XCTest
import SwiftUI
@testable import Stellwall

final class FakeAccount: AccountAPI {
    var calls: [String] = []
    func updateMember(_ id: String, displayName: String?, color: String?, world: String?) async throws -> Member {
        calls.append("update:\(displayName ?? "-"):\(world ?? "-")")
        return Member(id: id, username: "alex", displayName: displayName ?? "", role: "admin", color: color ?? "", world: world ?? "")
    }
    func changePassword(current: String, next: String) async throws { if current != "right-one" { throw APIError(status: 401, code: "invalid") } }
    func notificationPrefs() async throws -> [String: Bool] { Dictionary(uniqueKeysWithValues: MoreText.kinds.map { ($0.0, $0.0 != "shopping") }) }
    func setNotificationPref(_ kind: String, _ on: Bool) async throws { calls.append("pref:\(kind):\(on)") }
    func pushDevices() async throws -> [PushDevice] { [PushDevice(id: "d1", label: "Galaxy", createdAt: "2026-11-27T10:00:00.000Z")] }
    func deletePushDevice(_ id: String) async throws {}
    func registerFcm(token: String, label: String) async throws {}
    func pushTest() async throws -> Int { 1 }
    func appInfo() async throws -> (fcm: Bool, version: String?) { (true, nil) }
}

@MainActor
final class MoreTests: XCTestCase {
    func testProfileAndPasswordReadLikeTheWebApp() async {
        let f = FakeAccount()
        var changed: Member?
        let a = AccountModel(api: f, me: alexMember) { changed = $0 }
        let none = await a.saveProfile(name: " Alexa ", color: "person-sky", world: "pink")
        XCTAssertNil(none)
        XCTAssertEqual(changed?.world, "pink")
        XCTAssertEqual(f.calls, ["update:Alexa:pink"])
        let short = await a.changePassword(current: "x", next: "short")
        XCTAssertEqual(short, MoreText.hint)
        let wrong = await a.changePassword(current: "wrong", next: "long-enough-1")
        XCTAssertEqual(wrong, MoreText.wrong)
    }

    func testSwitchesAreKeptAndGoBackWhenTheServerSaysNo() async {
        let n = NotifyModel(api: FakeAccount())
        await n.load()
        XCTAssertEqual(n.prefs["shopping"], false)
        await n.set("shopping", true)
        XCTAssertEqual(n.prefs["shopping"], true)
        let t = await n.test()
        XCTAssertEqual(t, "Auf 1 Gerät geschickt.")
    }

    func testANotificationLinkOpensTheRightPlace() {
        XCTAssertEqual(Links.target("/einkauf?liste=l1").listId, "l1")
        XCTAssertEqual(Links.target("/einkauf?liste=l1").tab, .einkauf)
        XCTAssertEqual(Links.target("/kalender?tag=2026-12-02").date.map { Day($0) }, Day(2026, 12, 2))
        XCTAssertTrue(Links.target("/kalender/geburtstage").birthdays)
        XCTAssertEqual(Links.target("/todos").tab, .todos)
        XCTAssertTrue(Links.target("/mehr/benachrichtigungen").more)
        XCTAssertEqual(Links.target("/dokumente/d1").documentId, "d1")
        XCTAssertEqual(Links.target("/irgendwo").tab, .start)
    }

    func testThePictureOfMehr() {
        snap(MoreView(api: StubProtocol.client(), member: alexMember, webUrl: nil, theme: .constant(.system), onMemberChanged: { _ in }, onSignOut: {}, onBack: {}), world: "salbei", named: "more")
    }
}
