import Foundation
import Observation

/** The same wording as the web app's sign-in page. */
enum LoginText {
    static let title = "Anmelden"
    static let server = "Serveradresse"
    static let username = "Benutzername"
    static let password = "Passwort"
    static let submit = "Anmelden"
    static let badAddress = "Die Serveradresse stimmt nicht."
    static let invalid = "Benutzername oder Passwort stimmt nicht."
    static let unreachable = "Server nicht erreichbar. Adresse und Internet prüfen."
    static let generic = "Das hat nicht geklappt. Bitte noch einmal versuchen."
    static func locked(_ time: String) -> String { "Zu viele Fehlversuche. Anmelden geht wieder ab \(time)." }

    static func error(_ e: Error, zone: TimeZone = .current) -> String {
        if let e = e as? APIError {
            if e.code == "locked", let until = e.until, let at = ISO8601.date(until) {
                let f = DateFormatter()
                f.dateFormat = "HH:mm"
                f.timeZone = zone
                return locked(f.string(from: at))
            }
            if e.status == 401 { return invalid }
            return generic
        }
        if e is OfflineError { return unreachable }
        return generic
    }
}

enum ISO8601 {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain = ISO8601DateFormatter()

    static func date(_ s: String) -> Date? { withFraction.date(from: s) ?? plain.date(from: s) }
}

enum AppState: Equatable {
    case loading
    case unreachable
    case signedOut(server: String?)
    case signedIn(Member)
}

/** Sign-in state for the whole app: is the stored session still good, who is signed in. */
@MainActor
@Observable
final class AppModel {
    private(set) var state: AppState = .loading
    private(set) var api: APIClient?
    /** The password typed at sign-in, in memory only, so the first own password needs no second typing. */
    private(set) var signInPassword: String?
    private let prefs: DevicePrefs
    private let store: CookieStore
    private let clientFor: (URL, CookieStore) -> APIClient

    init(prefs: DevicePrefs = DevicePrefs(), store: CookieStore = KeychainCookieStore(), clientFor: @escaping (URL, CookieStore) -> APIClient = { APIClient(base: $0, store: $1) }) {
        self.prefs = prefs
        self.store = store
        self.clientFor = clientFor
    }

    var server: String? { prefs.server }

    func start() async {
        guard let s = prefs.server, let url = URL(string: s) else {
            state = .signedOut(server: nil)
            return
        }
        state = .loading
        let c = clientFor(url, store)
        do {
            if let me = try await c.me() {
                api = c
                state = .signedIn(me)
            } else {
                state = .signedOut(server: prefs.server)
            }
        } catch is OfflineError {
            state = .unreachable
        } catch {
            state = .signedOut(server: prefs.server)
        }
    }

    /** Returns the error to show, or nil when signed in. */
    func signIn(server: String, username: String, password: String) async -> String? {
        guard let url = ServerAddress.parse(server) else { return LoginText.badAddress }
        let c = clientFor(url, store)
        do {
            let me = try await c.login(username: username.trimmingCharacters(in: .whitespaces), password: password)
            prefs.server = url.absoluteString
            api = c
            signInPassword = password
            state = .signedIn(me)
            return nil
        } catch {
            return LoginText.error(error)
        }
    }

    func memberChanged(_ m: Member) {
        if case .signedIn = state { state = .signedIn(m) }
    }

    func signOut(pushEndpoint: String? = nil) async {
        signInPassword = nil
        await api?.logout(pushEndpoint: pushEndpoint)
        api = nil
        state = .signedOut(server: prefs.server)
    }
}
