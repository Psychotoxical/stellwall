import SwiftUI

@main
struct StellwallApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

/** Until sign-in exists: the wordmark on the person's ground. */
struct RootView: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        SplashView().themed(world: "flieder", dark: scheme == .dark)
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
