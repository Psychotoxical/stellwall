import Foundation
import Observation

struct PushDevice: Codable, Equatable, Identifiable { let id: String; let label: String; let createdAt: String }

/** The web app's wording for Mehr, account and notifications. */
enum MoreText {
    static let page = "Mehr"
    static let profile = "Name und Farbe"
    static let name = "Anzeigename"
    static let color = "Farbe"
    static let colorHint = "Deine Kennfarbe: daran erkennen dich die anderen, zum Beispiel im Kalender."
    static let world = "Deine Farbwelt"
    static let worldHint = "Die App nimmt deine Farbe an, auf allen deinen Geräten."
    static let worlds = [("salbei", "Salbei"), ("flieder", "Flieder"), ("pfirsich", "Pfirsich"), ("himmel", "Himmel"), ("rose", "Rosé"), ("sonne", "Sonne"), ("pink", "Pink")]
    static let colors = ["person-mint", "person-lilac", "person-peach", "person-sky"]
    static let theme = "Darstellung"
    static let themeHint = "Gilt für dieses Gerät."
    static let password = "Passwort ändern"
    static let current = "Aktuelles Passwort"
    static let new = "Neues Passwort"
    static let hint = "Mindestens 10 Zeichen."
    static let changed = "Passwort geändert."
    static let wrong = "Das aktuelle Passwort stimmt nicht."
    static let saved = "Gespeichert."
    static let save = "Speichern"
    static let logout = "Auf diesem Gerät abmelden"
    static let generic = "Das hat nicht geklappt. Bitte noch einmal versuchen."
    static let notify = "Benachrichtigungen"
    static let step1 = "Auf diesem Gerät erlauben"
    static let step2 = "Was gemeldet wird"
    static let step3 = "Ausprobieren"
    static let allow = "Benachrichtigungen erlauben"
    static let on = "Dieses Gerät bekommt Nachrichten."
    static let denied = "Benachrichtigungen sind für Stellwall blockiert. Erlaube sie in den iPhone-Einstellungen, dann hier noch einmal versuchen."
    static let openSettings = "Einstellungen öffnen"
    static let noFcm = "Der Server kann Handys noch nicht benachrichtigen. Die Verwaltung richtet das ein."
    static let noBuild = "In dieser App-Version sind Benachrichtigungen noch nicht eingerichtet."
    static let kinds = [
        ("event", "Termine für mich"), ("event_reminder", "Termin-Erinnerungen"), ("todo", "To-dos, die mir jemand gibt"), ("todo_reminder", "To-do-Erinnerungen"),
        ("shopping", "Einkaufslisten"), ("birthday", "Geburtstage"), ("meal", "Essensplan: als Koch eingetragen"), ("document_expiry", "Ablaufende Dokumente"),
    ]
    static let quiet = "Nachts von 22 bis 7 Uhr bleibt es still. Erinnerungen an Termine kommen trotzdem pünktlich."
    static let test = "Probe-Nachricht schicken"
    static func tested(_ n: Int) -> String { n == 0 ? "Noch kein Gerät eingerichtet." : n == 1 ? "Auf 1 Gerät geschickt." : "Auf \(n) Geräte geschickt." }
    static let devices = "Deine Geräte"
    static let noDevices = "Noch kein Gerät bekommt Nachrichten."
    static func remove(_ label: String) -> String { "\(label) entfernen" }
    static let about = "Über Stellwall"
    static func version(_ v: String) -> String { "Version \(v)" }
    static let licenses = "Schriften: Sofia Sans, Sofia Sans Condensed und Fredoka unter der SIL Open Font License 1.1. Symbole: Solar von 480 Design unter CC BY 4.0."
    static let admin = "Verwaltung im Browser"
}

protocol AccountAPI {
    func updateMember(_ id: String, displayName: String?, color: String?, world: String?) async throws -> Member
    func changePassword(current: String, next: String) async throws
    func notificationPrefs() async throws -> [String: Bool]
    func setNotificationPref(_ kind: String, _ on: Bool) async throws
    func pushDevices() async throws -> [PushDevice]
    func deletePushDevice(_ id: String) async throws
    func registerFcm(token: String, label: String) async throws
    func pushTest() async throws -> Int
    func appInfo() async throws -> (fcm: Bool, version: String?)
}

extension APIClient: AccountAPI {
    func updateMember(_ id: String, displayName: String?, color: String?, world: String?) async throws -> Member {
        struct Body: Encodable { let displayName: String?; let color: String?; let world: String? }
        return try await json(Member.self, "PATCH", "api/members/\(id)", body: Body(displayName: displayName, color: color, world: world))
    }

    func notificationPrefs() async throws -> [String: Bool] { try await json([String: Bool].self, "GET", "api/notification-prefs") }
    func setNotificationPref(_ kind: String, _ on: Bool) async throws { try await send("PUT", "api/notification-prefs", body: try APIClient.encoder.encode([kind: on])) }
    func pushDevices() async throws -> [PushDevice] { try await json([PushDevice].self, "GET", "api/push/subscriptions") }
    func deletePushDevice(_ id: String) async throws { try await send("DELETE", "api/push/subscriptions/\(id)") }
    func registerFcm(token: String, label: String) async throws { try await send("POST", "api/push/fcm", body: try APIClient.encoder.encode(["token": token, "label": String(label.prefix(60))])) }
    func pushTest() async throws -> Int {
        struct D: Decodable { let devices: Int }
        return try await json(D.self, "POST", "api/push/test").devices
    }

    func appInfo() async throws -> (fcm: Bool, version: String?) {
        struct Info: Decodable { let fcm: Bool }
        return (try await json(Info.self, "GET", "api/app/info").fcm, nil)
    }
}

@MainActor
@Observable
final class AccountModel {
    private let api: AccountAPI
    private(set) var me: Member
    private let onChanged: (Member) -> Void

    init(api: AccountAPI, me: Member, onChanged: @escaping (Member) -> Void) {
        self.api = api
        self.me = me
        self.onChanged = onChanged
    }

    /** Error to show, or nil when saved. */
    func saveProfile(name: String, color: String, world: String) async -> String? {
        let n = name.trimmingCharacters(in: .whitespaces)
        if n.isEmpty { return EventForms.invalid }
        do {
            let m = try await api.updateMember(me.id, displayName: n, color: color, world: world)
            me = m
            onChanged(m)
            return nil
        } catch {
            return MoreText.generic
        }
    }

    func changePassword(current: String, next: String) async -> String? {
        if next.count < 10 { return MoreText.hint }
        do {
            try await api.changePassword(current: current, next: next)
            return nil
        } catch let e as APIError {
            return e.status == 401 ? MoreText.wrong : e.status == 400 ? MoreText.hint : MoreText.generic
        } catch {
            return MoreText.generic
        }
    }
}

@MainActor
@Observable
final class NotifyModel {
    private(set) var prefs: [String: Bool] = [:]
    private(set) var devices: [PushDevice] = []
    private(set) var error: String?
    private let api: AccountAPI

    init(api: AccountAPI) { self.api = api }

    func load() async {
        do {
            prefs = try await api.notificationPrefs()
            devices = try await api.pushDevices()
            error = nil
        } catch {
            self.error = MoreText.generic
        }
    }

    func set(_ kind: String, _ on: Bool) async {
        let before = prefs
        prefs[kind] = on
        error = nil
        do { try await api.setNotificationPref(kind, on) } catch {
            prefs = before
            self.error = MoreText.generic
        }
    }

    func register(token: String, label: String) async {
        do {
            try await api.registerFcm(token: token, label: label)
            await load()
        } catch {
            self.error = MoreText.generic
        }
    }

    func test() async -> String {
        do {
            let n = try await api.pushTest()
            await load()
            return MoreText.tested(n)
        } catch {
            return MoreText.generic
        }
    }

    func remove(_ d: PushDevice) async {
        try? await api.deletePushDevice(d.id)
        await load()
    }
}
