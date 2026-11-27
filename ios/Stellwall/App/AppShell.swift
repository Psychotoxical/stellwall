import SwiftUI

/** The signed-in app: tab bar, the live connection while the app is in front, and the areas. */
struct AppShell: View {
    let me: Member
    let api: APIClient
    var webUrl: String? = nil
    let onMemberChanged: (Member) -> Void
    let onSignOut: () -> Void
    @State private var tab: Tab = .start
    @State private var listId: String?
    @State private var target: Target?
    @State private var more = false
    @State private var documents = false
    @State private var start: StartModel
    @State private var shopping: ShoppingModel
    @State private var calendar: CalendarModel
    @State private var birthdays: BirthdaysModel
    @Environment(\.scenePhase) private var phase
    @Environment(\.palette) private var p

    init(me: Member, api: APIClient, webUrl: String? = nil, onMemberChanged: @escaping (Member) -> Void, onSignOut: @escaping () -> Void) {
        self.me = me
        self.api = api
        self.webUrl = webUrl
        self.onMemberChanged = onMemberChanged
        self.onSignOut = onSignOut
        _start = State(initialValue: StartModel(board: { try await api.board() }))
        _shopping = State(initialValue: ShoppingModel(api: api, me: me))
        _calendar = State(initialValue: CalendarModel(api: api, me: me))
        _birthdays = State(initialValue: BirthdaysModel(api: api, me: me))
    }

    func go(_ t: Target) {
        tab = t.tab
        listId = t.listId
        target = t
        more = t.more
        documents = t.documents
    }

    var body: some View {
        TabView(selection: Binding(get: { tab }, set: { t in tab = t; more = false; documents = false; if t == .einkauf { listId = nil } })) {
            ForEach(Tab.allCases, id: \.self) { t in
                area(t)
                    .tabItem { Label { Text(t.rawValue) } icon: { t.icon.image } }
                    .tag(t)
            }
        }
        .tint(p.ink.color)
        // One connection for all areas, only while the app is in front.
        .task(id: phase == .active) {
            guard phase == .active else { return }
            for await e in api.live() {
                await start.onLive(e)
                await shopping.onLive(e)
                await calendar.onLive(e)
            }
        }
        .onChange(of: tab) { old, _ in if old == .einkauf { Task { await shopping.leave() } } }
    }

    @ViewBuilder private func area(_ t: Tab) -> some View {
        if t == .start && more {
            MorePlaceholder(onBack: { more = false }, onSignOut: onSignOut)
        } else {
            switch t {
            case .start:
                StartView(member: me, model: start, onMore: { more = true }, banner: { EmptyView() }, mine: { EmptyView() }) { go($0) }
            case .einkauf:
                ShoppingView(model: shopping, listId: listId)
            case .kalender:
                CalendarView(model: calendar, birthdays: birthdays, startDate: target?.date.map { Day($0) }, openBirthdays: target?.birthdays == true)
                    .id(target.map { "\($0.date?.timeIntervalSince1970 ?? 0)\($0.birthdays)" } ?? "")
            default:
                VStack(alignment: .leading) {
                    Wordmark()
                    PageHead(title: t.rawValue).padding(.top, 14)
                    Spacer()
                }
                .padding(16)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .background(p.ground.color.ignoresSafeArea())
            }
        }
    }
}

/** Replaced by Mehr in a later step. */
struct MorePlaceholder: View {
    let onBack: () -> Void
    let onSignOut: () -> Void
    @Environment(\.palette) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            BackLink(parent: "Start", action: onBack)
            PageHead(title: "Mehr")
            GhostButton("Auf diesem Gerät abmelden", action: onSignOut)
            Spacer()
        }
        .padding(16)
        .background(p.ground.color.ignoresSafeArea())
    }
}
