import SwiftUI

/** The signed-in app: tab bar, the live connection while the app is in front, and the areas. */
struct AppShell: View {
    let me: Member
    let api: APIClient
    var webUrl: String? = nil
    @Binding var theme: ThemeChoice
    let onMemberChanged: (Member) -> Void
    let onSignOut: () -> Void
    @State private var tab: Tab = .start
    @State private var listId: String?
    @State private var target: Target?
    @State private var more = false
    @State private var documents = false
    /** Counts taps on the tab that is already open: each one starts that tab afresh, at its top. */
    @State private var again: [Tab: Int] = [:]
    @State private var start: StartModel
    @State private var shopping: ShoppingModel
    @State private var calendar: CalendarModel
    @State private var birthdays: BirthdaysModel
    @State private var meals: MealsModel
    @State private var todos: TodosModel
    @State private var docs: DocumentsModel
    @State private var mine: TodayModel
    @Environment(\.scenePhase) private var phase
    @Environment(\.palette) private var p

    init(me: Member, api: APIClient, webUrl: String? = nil, theme: Binding<ThemeChoice>, onMemberChanged: @escaping (Member) -> Void, onSignOut: @escaping () -> Void) {
        self.me = me
        self.api = api
        self.webUrl = webUrl
        _theme = theme
        self.onMemberChanged = onMemberChanged
        self.onSignOut = onSignOut
        _start = State(initialValue: StartModel(board: { try await api.board() }))
        _shopping = State(initialValue: ShoppingModel(api: api, me: me))
        _calendar = State(initialValue: CalendarModel(api: api, me: me))
        _birthdays = State(initialValue: BirthdaysModel(api: api, me: me))
        _meals = State(initialValue: MealsModel(api: api))
        _todos = State(initialValue: TodosModel(api: api, me: me))
        _docs = State(initialValue: DocumentsModel(api: api, me: me))
        _mine = State(initialValue: TodayModel(todos: api, calendar: api, meals: api))
    }

    func go(_ t: Target) {
        tab = t.tab
        listId = t.listId
        target = t
        more = t.more
        documents = t.documents
    }

    var body: some View {
        TabView(selection: Binding(get: { tab }, set: { t in
            if t == tab { again[t, default: 0] += 1 }
            tab = t; more = false; documents = false; if t == .einkauf { listId = nil }
        })) {
            ForEach(Tab.allCases, id: \.self) { t in
                area(t)
                    .id(again[t, default: 0])
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
                await meals.onLive(e)
                await todos.onLive(e)
                await docs.onLive(e)
                await mine.onLive(e)
            }
        }
        .onChange(of: tab) { old, _ in if old == .einkauf { Task { await shopping.leave() } } }
        // A tapped notification opens where it belongs.
        .onChange(of: LinkInbox.shared.url, initial: true) { _, url in
            guard let url else { return }
            go(Links.target(url))
            LinkInbox.shared.url = nil
        }
        // Once per start, and whenever Firebase hands over a new token: this phone gets messages.
        .task(id: LinkInbox.shared.token) {
            guard Push.available, await Push.allowed() else { return }
            var token = LinkInbox.shared.token
            if token == nil { token = await Push.token() }
            guard let t = token else { return }
            try? await api.registerFcm(token: t, label: Push.label)
        }
    }

    @ViewBuilder private func area(_ t: Tab) -> some View {
        if t == .start && documents {
            DocumentsArea(model: docs, startId: target?.documentId) { documents = false }
                .backSwipe { documents = false }
                .id(target?.documentId ?? "")
        } else if t == .start && more {
            MoreView(api: api, member: me, webUrl: webUrl, theme: $theme, onMemberChanged: onMemberChanged, onSignOut: onSignOut, onBack: { more = false })
                .backSwipe { more = false }
        } else {
            switch t {
            case .start:
                StartView(member: me, model: start, onMore: { more = true }, banner: { EmptyView() }, mine: { TodayView(model: mine) { go($0) } }) { go($0) }
            case .einkauf:
                ShoppingView(model: shopping, listId: listId)
            case .kalender:
                CalendarView(model: calendar, birthdays: birthdays, startDate: target?.date.map { Day($0) }, openBirthdays: target?.birthdays == true)
                    .id(target.map { "\($0.date?.timeIntervalSince1970 ?? 0)\($0.birthdays)" } ?? "")
            case .essen:
                MealsArea(model: meals, cook: target?.cook) { id in go(Target(tab: .einkauf, listId: id)) }
                    .id(target?.cook?.slug ?? "")
            case .todos:
                TodosView(model: todos)
            }
        }
    }
}
