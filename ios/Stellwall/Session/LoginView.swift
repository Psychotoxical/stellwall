import SwiftUI

struct LoginView: View {
    let server: String?
    let onSubmit: (String, String, String) async -> String?
    @State private var address = ""
    @State private var username = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false
    @Environment(\.palette) private var p

    init(server: String?, onSubmit: @escaping (String, String, String) async -> String?) {
        self.server = server
        self.onSubmit = onSubmit
        _address = State(initialValue: ServerAddress.shown(server))
    }

    private var ready: Bool { !address.trimmingCharacters(in: .whitespaces).isEmpty && !username.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty && !busy }

    private func submit() {
        guard ready else { return }
        busy = true
        error = nil
        Task {
            error = await onSubmit(address, username, password)
            busy = false
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Wordmark(size: 40)
                Text(LoginText.title).font(.swTitle).accessibilityAddTraits(.isHeader).padding(.bottom, 6)
                Field(label: LoginText.server, text: $address, keyboard: .URL, capitalization: .never, autocorrect: false, submit: .next)
                Field(label: LoginText.username, text: $username, capitalization: .never, autocorrect: false, submit: .next)
                Field(label: LoginText.password, text: $password, secure: true, onSubmit: submit)
                if let error { Notice(error) }
                PrimaryButton(LoginText.submit, enabled: ready, action: submit)
            }
            .frame(maxWidth: 420)
            .padding(24)
            .padding(.top, 40)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(p.ground.color.ignoresSafeArea())
    }
}

enum FirstPasswordText {
    static func title(_ name: String) -> String { "Hallo \(name), bitte ein eigenes Passwort" }
    static let lead = "Dein Passwort hat die Verwaltung vergeben. Wähle jetzt eins, das nur du kennst."
    static let current = "Altes Passwort"
    static let submit = "Passwort speichern"
    static let newPassword = "Neues Passwort"
    static let hint = "Mindestens 10 Zeichen."
    static let wrong = "Das alte Passwort stimmt nicht."
    static let logout = "Auf diesem Gerät abmelden"
}

/** After the first sign-in with a password the administration chose, the member picks an own one. */
struct FirstPasswordView: View {
    let name: String
    let known: String?
    let onSubmit: (String, String) async -> String?
    let onSignOut: () -> Void
    @State private var current = ""
    @State private var next = ""
    @State private var error: String?
    @State private var busy = false
    @Environment(\.palette) private var p

    private var ready: Bool { (known != nil || !current.isEmpty) && !next.isEmpty && !busy }

    private func submit() {
        guard ready else { return }
        busy = true
        Task {
            error = await onSubmit(known ?? current, next)
            busy = false
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Wordmark(size: 40)
                Text(FirstPasswordText.title(name)).font(.swTitle).accessibilityAddTraits(.isHeader)
                Text(FirstPasswordText.lead).font(.swBody)
                if known == nil { Field(label: FirstPasswordText.current, text: $current, secure: true, submit: .next) }
                Field(label: FirstPasswordText.newPassword, text: $next, secure: true, hint: FirstPasswordText.hint, onSubmit: submit)
                if let error { Notice(error) }
                PrimaryButton(FirstPasswordText.submit, enabled: ready, action: submit)
                GhostButton(FirstPasswordText.logout, action: onSignOut)
            }
            .frame(maxWidth: 420)
            .padding(24)
            .padding(.top, 40)
            .frame(maxWidth: .infinity)
        }
        .background(p.ground.color.ignoresSafeArea())
    }
}

/** Error to show for a password change, or nil. */
func passwordChangeError(_ e: Error?) -> String? {
    guard let e else { return nil }
    if let e = e as? APIError { return e.status == 401 ? FirstPasswordText.wrong : e.status == 400 ? FirstPasswordText.hint : LoginText.generic }
    return e is OfflineError ? LoginText.unreachable : LoginText.generic
}
