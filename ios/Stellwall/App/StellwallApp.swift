import SwiftUI

@main
struct StellwallApp: App {
    @State private var model = AppModel()
    @State private var theme = DevicePrefs().theme

    var body: some Scene {
        WindowGroup {
            RootView(model: model, theme: $theme)
        }
    }
}

/** Sign-in first, then the app in the member's own colour world. */
struct RootView: View {
    let model: AppModel
    @Binding var theme: ThemeChoice
    @Environment(\.colorScheme) private var system

    private var world: String {
        if case let .signedIn(m) = model.state { return m.world }
        return "flieder"
    }

    var body: some View {
        content
            .themed(world: world, choice: theme, system: system)
            .task { if model.state == .loading { await model.start() } }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            SplashView()
        case .unreachable:
            UnreachableView { Task { await model.start() } }
        case let .signedOut(server):
            LoginView(server: server) { s, u, pw in await model.signIn(server: s, username: u, password: pw) }
        case let .signedIn(me):
            if me.mustChangePassword, let api = model.api {
                FirstPasswordView(name: me.displayName, known: model.signInPassword, onSubmit: { current, next in
                    if next.count < 10 { return FirstPasswordText.hint }
                    do {
                        try await api.changePassword(current: current, next: next)
                        var m = me
                        m.mustChangePassword = false
                        model.memberChanged(m)
                        return nil
                    } catch {
                        return passwordChangeError(error)
                    }
                }, onSignOut: { Task { await model.signOut() } })
            } else if let api = model.api {
                AppShell(me: me, api: api, webUrl: model.server, onMemberChanged: model.memberChanged, onSignOut: { Task { await model.signOut() } })
                    .id(me.id)
            }
        }
    }
}

struct SplashView: View {
    @Environment(\.palette) private var p

    var body: some View {
        ZStack {
            p.ground.color.ignoresSafeArea()
            Wordmark(size: 40)
        }
    }
}

struct UnreachableView: View {
    let retry: () -> Void
    @Environment(\.palette) private var p

    var body: some View {
        VStack(spacing: 16) {
            Wordmark(size: 40)
            Text(LoginText.unreachable).font(.swBody).multilineTextAlignment(.center)
            PrimaryButton("Erneut versuchen", action: retry).frame(maxWidth: 320)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(p.ground.color.ignoresSafeArea())
    }
}
