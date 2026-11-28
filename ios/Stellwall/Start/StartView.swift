import SwiftUI

/** The web app's wording for Start. */
enum StartText {
    static let board = "Seit du zuletzt hier warst"
    static let boardEmpty = "Noch nichts Neues. Sobald jemand etwas einträgt, steht es hier."
    static let areas = "Bereiche"
    static let new = "NEU"

    /** A greeting for the time of day, as in the web app. */
    static func hello(_ name: String, hour: Int) -> String {
        switch hour {
        case 5...10: "Guten Morgen, \(name)"
        case 11...13: "Guten Mittag, \(name)"
        case 14...17: "Guten Tag, \(name)"
        case 18...21: "Guten Abend, \(name)"
        default: "Gute Nacht, \(name)"
        }
    }

    static func count(_ n: Int) -> String { n == 0 ? "alles gesehen" : "\(n) neu" }
    static let seen = "Gesehen"
    static let seenAll = "Alle gesehen"
    static func seenLabel(_ what: String) -> String { "Gesehen: \(what)" }

    static func today(_ d: Date, zone: TimeZone = .current) -> String { fmt("EEEE, d. MMMM", zone).string(from: d) }
    static func time(_ iso: String, zone: TimeZone = .current) -> String { ISO8601.date(iso).map { fmt("HH:mm", zone).string(from: $0) } ?? "" }

    static func fmt(_ pattern: String, _ zone: TimeZone) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "de_DE")
        f.timeZone = zone
        f.dateFormat = pattern
        return f
    }

    static func area(_ r: BoardRow) -> String {
        switch r {
        case .shopping: "Einkauf"
        case .todo: "To-dos"
        case .event: "Kalender"
        }
    }

    static func line(_ r: BoardRow, zone: TimeZone = .current) -> String {
        switch r {
        case let .shopping(_, who, _, list, count, _, _): return "\(who) hat \(count == 1 ? "1 Sache" : "\(count) Sachen") auf „\(list)“ gesetzt"
        case let .todo(_, who, _, title, _): return "\(who) hat dir „\(title)“ gegeben"
        case let .event(_, who, _, title, start, allDay, _):
            guard let at = ISO8601.date(start) else { return "\(who) hat dir einen Termin eingetragen: \(title)" }
            let day = fmt("EEE, d.M.", zone).string(from: at)
            return "\(who) hat dir einen Termin eingetragen: \(title), \(day)\(allDay ? "" : " " + fmt("HH:mm", zone).string(from: at))"
        }
    }
}

/** The board on Start; it follows the live hints that can change it. */
@MainActor
@Observable
final class StartModel {
    private(set) var rows: [BoardRow]?
    private let board: () async throws -> [BoardRow]
    private let dismiss: ([String]) async throws -> Void
    private let seenAll: () async throws -> Void

    init(board: @escaping () async throws -> [BoardRow], dismiss: @escaping ([String]) async throws -> Void = { _ in }, seenAll: @escaping () async throws -> Void = {}) {
        self.board = board
        self.dismiss = dismiss
        self.seenAll = seenAll
    }

    func load() async { if let r = try? await board() { rows = r } }

    /** A line stays until it is ticked off; it goes at once, the server catches up. */
    func seen(_ r: BoardRow) async {
        rows = rows?.filter { $0.id != r.id }
        try? await dismiss(r.keys)
        await load()
    }

    func seenEverything() async {
        rows = []
        try? await seenAll()
        await load()
    }
    func onLive(_ e: LiveEvent) async { if e != .meals { await load() } }
}

/** Where a tap leads: a tab, a list, a day, birthdays, a cook page, Mehr or documents. */
struct Target: Equatable {
    var tab: Tab
    var listId: String? = nil
    var date: Date? = nil
    var birthdays = false
    var cook: CookTarget? = nil
    var more = false
    var documents = false
    var documentId: String? = nil
}

enum Tab: String, CaseIterable, Hashable {
    case start = "Start", einkauf = "Einkauf", kalender = "Kalender", essen = "Essen", todos = "To-dos"

    var icon: Icons {
        switch self {
        case .start: .home
        case .einkauf: .cart
        case .kalender: .calendar
        case .essen: .meals
        case .todos: .todos
        }
    }
}

struct StartView<Banner: View, Today: View>: View {
    let member: Member
    let model: StartModel
    var today = Date()
    var hour = Calendar.current.component(.hour, from: Date())
    var onMore: (() -> Void)? = nil
    @ViewBuilder var banner: Banner
    @ViewBuilder var mine: Today
    let onOpen: (Target) -> Void
    @Environment(\.palette) private var p

    private struct Area: Identifiable {
        let label: String
        let icon: Icons
        let target: Target
        var id: String { label }
    }

    private let areas = [
        Area(label: "Einkauf", icon: .cart, target: Target(tab: .einkauf)),
        Area(label: "To-dos", icon: .todos, target: Target(tab: .todos)),
        Area(label: "Kalender", icon: .calendar, target: Target(tab: .kalender)),
        Area(label: "Geburtstage", icon: .cake, target: Target(tab: .kalender, birthdays: true)),
        Area(label: "Dokumente", icon: .documents, target: Target(tab: .start, documents: true)),
        Area(label: "Essensplan", icon: .meals, target: Target(tab: .essen)),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Wordmark(size: 22)
                    Spacer()
                    if let onMore {
                        Button(action: onMore) {
                            Text(String(member.displayName.prefix(1)).uppercased()).font(.swHead).foregroundStyle(PersonColors.ink.color)
                                .frame(width: 48, height: 48).background(PersonColors.of(member.color).color, in: Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Mehr")
                    }
                }
                PageHead(title: StartText.hello(member.displayName, hour: hour), sub: StartText.today(today)).padding(.top, 14)
                banner
                board.padding(.top, 10)
                mine
                SectionHead(title: StartText.areas)
                BoxCard {
                    ForEach(Array(areas.enumerated()), id: \.element.id) { i, a in
                        if i > 0 { RowDivider() }
                        Button { onOpen(a.target) } label: {
                            HStack(spacing: 12) {
                                a.icon.image.resizable().frame(width: 28, height: 28).foregroundStyle(p.ink.color)
                                Text(a.label).font(.swLabel).foregroundStyle(p.ink.color)
                                Spacer()
                            }
                            .padding(.horizontal, 14).frame(minHeight: 56).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .background(p.ground.color.ignoresSafeArea())
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    private var board: some View {
        let rows = model.rows ?? []
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .lastTextBaseline) {
                Text(StartText.board).font(Fonts.title(19, style: .headline)).foregroundStyle(p.boardInk.color).accessibilityAddTraits(.isHeader)
                Spacer()
                if rows.isEmpty {
                    Text(StartText.count(0)).font(.swSmall).foregroundStyle(p.boardSoft.color)
                } else {
                    Button(StartText.seenAll) { Task { await model.seenEverything(); Haptic.done() } }
                        .font(.swSmall).foregroundStyle(p.boardSoft.color)
                        .padding(.horizontal, 12).frame(minHeight: 36)
                        .overlay(Capsule().stroke(p.boardRule.color))
                        .buttonStyle(.plain)
                }
            }
            .padding(.bottom, 10)
            Rectangle().fill(p.boardRule.color).frame(height: 1)
            if rows.isEmpty {
                Text(StartText.boardEmpty).font(.swBody).foregroundStyle(p.boardSoft.color).padding(.top, 12)
            }
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                if i > 0 { Rectangle().fill(p.boardRule.color).frame(height: 1) }
                HStack(spacing: 10) {
                    Button { onOpen(target(r)) } label: {
                        HStack(spacing: 12) {
                            Text(StartText.time(r.latestAt)).font(Fonts.body(16, weight: 700, style: .headline)).foregroundStyle(p.boardInk.color).frame(width: 52, alignment: .leading)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(StartText.line(r)).font(.swLabel).foregroundStyle(p.boardInk.color)
                                Text(StartText.area(r)).font(.swSmall).foregroundStyle(p.boardSoft.color)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 11).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    // A tick, not a word: on a small phone the line itself needs the room.
                    Button { Task { await model.seen(r); Haptic.tap() } } label: {
                        Image(systemName: "checkmark").font(.system(size: 17, weight: .semibold)).foregroundStyle(p.boardInk.color)
                            .frame(width: 44, height: 44).overlay(Circle().stroke(p.boardRule.color))
                    }
                        .buttonStyle(.plain)
                        .accessibilityLabel(StartText.seenLabel(StartText.line(r)))
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .background(p.board.color, in: RoundedRectangle(cornerRadius: 16))
    }

    private func target(_ r: BoardRow) -> Target {
        switch r {
        case let .shopping(_, _, listId, _, _, _, _): Target(tab: .einkauf, listId: listId)
        case .todo: Target(tab: .todos)
        case let .event(_, _, _, _, start, _, _): Target(tab: .kalender, date: ISO8601.date(start))
        }
    }
}
