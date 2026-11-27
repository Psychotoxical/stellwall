import Foundation
import Observation

struct Done: Codable, Equatable { let by: String; let at: String }

/** One to-do on one day (or without a day). */
struct Occurrence: Codable, Equatable, Identifiable {
    let todoId: String
    let title: String
    let date: String?
    let at: String?
    let overdue: Bool
    var done: Done?
    let assignees: [String]
    let needsConfirm: Bool
    let everyone: Bool
    let createdBy: String
    var id: String { "\(todoId)|\(date ?? "")" }
}

/** none, daily, weekly (weekdays 1 = Monday) or monthly (day of month). */
struct Recurrence: Codable, Equatable { var kind: String; var weekdays: [Int]? = nil; var day: Int? = nil }

struct TodoRule: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let visibility: Visibility
    let createdBy: String
    let assignees: [String]
    let startDate: String?
    let time: String?
    let recurrence: Recurrence
    let until: String?
    let needsConfirm: Bool
    let reminders: [Int]
}

enum TodoView: String, CaseIterable {
    case today, upcoming, undated

    var label: String { switch self { case .today: "Heute"; case .upcoming: "Demnächst"; case .undated: "Ohne Termin" } }
    var empty: String { switch self { case .today: "Heute steht nichts an."; case .upcoming: "In den nächsten zwei Wochen steht nichts an."; case .undated: "Keine To-dos ohne Termin." } }
}

/** The web app's to-do wording. */
enum TodoText {
    static let title = "Was ist zu tun?"
    static let page = "To-dos"
    static let new = "Neues To-do"
    static let edit = "To-do bearbeiten"
    static let mine = "Meine"
    static let all = "Alle"
    static let overdue = "Überfällig"
    static func check(_ t: String) -> String { "\(t) abhaken" }
    static func uncheck(_ t: String) -> String { "\(t) wieder offen" }
    static func doneBy(_ who: String) -> String { "\(who) hat erledigt" }
    static let what = "Was ist zu tun?"
    static let assignees = "Wer kümmert sich?"
    static let date = "Datum"
    static let time = "Uhrzeit"
    static let noDate = "Ohne Datum"
    static let noTime = "Ohne Uhrzeit"
    static let `repeat` = "Wiederholen"
    static let repeats = [("none", "Nie"), ("daily", "Täglich"), ("weekly", "An Wochentagen"), ("monthly", "Monatlich")]
    static let weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
    static let until = "Wiederholen bis (optional)"
    static let needsConfirm = "Muss bestätigt werden"
    static let needsConfirmSub = "Man hakt es ab, und alle sehen, wer es erledigt hat."
    static let reminders = "Erinnern"
    static let reminderChips = [(1440, "1 Tag vorher"), (60, "1 Stunde vorher"), (10, "10 Minuten vorher")]
    static let delete = "To-do löschen"
    static let pickDay = "Wähle mindestens einen Wochentag."
    static let needsDate = "Für eine Wiederholung braucht es ein Datum."
    static let invalid = "Bitte die Eingaben prüfen."
    static let generic = "Das hat nicht geklappt. Bitte noch einmal versuchen."
    static let myToday = "Heute für dich"
    static let save = "Speichern"
    static let cancel = "Abbrechen"

    /** "Fr., 27.11., 08:00", without the time when it is midnight. */
    static func whenText(_ o: Occurrence, zone: TimeZone = .current) -> String {
        guard let date = o.date, let d = Day(date) else { return "" }
        let day = d.format("EE, d.M.")
        let time = o.at.flatMap(ISO8601.date).map { Clock($0, zone: zone).description }
        return time != nil && time != "00:00" ? "\(day), \(time!)" : day
    }
}

let UNDATED = "1970-01-01"

protocol TodosAPI {
    func members() async throws -> [Member]
    func todos(view: String, mine: Bool) async throws -> [Occurrence]
    func todo(_ id: String) async throws -> TodoRule
    func createTodo(_ body: [String: Any]) async throws
    func updateTodo(_ id: String, _ body: [String: Any]) async throws
    func deleteTodo(_ id: String) async throws
    func done(_ id: String, date: String) async throws
    func undone(_ id: String, date: String) async throws
    func todoSuggestions(_ q: String) async throws -> [String]
}

extension APIClient: TodosAPI {
    func todos(view: String, mine: Bool) async throws -> [Occurrence] { try await json([Occurrence].self, "GET", "api/todos", query: [("view", view), ("mine", mine ? "1" : nil)]) }
    func todo(_ id: String) async throws -> TodoRule { try await json(TodoRule.self, "GET", "api/todos/\(id)") }
    func createTodo(_ body: [String: Any]) async throws { try await send("POST", "api/todos", body: try JSONSerialization.data(withJSONObject: body)) }
    func updateTodo(_ id: String, _ body: [String: Any]) async throws { try await send("PATCH", "api/todos/\(id)", body: try JSONSerialization.data(withJSONObject: body)) }
    func deleteTodo(_ id: String) async throws { try await send("DELETE", "api/todos/\(id)") }
    func done(_ id: String, date: String) async throws { try await send("POST", "api/todos/\(id)/done", body: try APIClient.encoder.encode(["date": date])) }
    func undone(_ id: String, date: String) async throws { try await send("DELETE", "api/todos/\(id)/done/\(date)") }
    func todoSuggestions(_ q: String) async throws -> [String] {
        struct N: Decodable { let name: String }
        return try await json([N].self, "GET", "api/todo-suggestions", query: [("q", q)]).map(\.name)
    }
}

struct TodoDraft: Equatable {
    var title: String
    var visibility: Visibility
    var assignees: [String]
    var startDate: Day?
    var time: Clock?
    var `repeat`: String
    var weekdays: Set<Int>
    var until: Day?
    var needsConfirm: Bool
    var reminders: [Int]

    static func of(_ r: TodoRule?) -> TodoDraft {
        TodoDraft(title: r?.title ?? "", visibility: r?.visibility ?? .all, assignees: r?.assignees ?? [], startDate: r?.startDate.flatMap(Day.init), time: r?.time.flatMap(Clock.init),
                  repeat: r?.recurrence.kind ?? "none", weekdays: Set(r?.recurrence.weekdays ?? []), until: r?.until.flatMap(Day.init), needsConfirm: r?.needsConfirm ?? false, reminders: r?.reminders ?? [])
    }
}

/** The web app's to-do form rules: nulls are sent, an empty date or time is a change too. */
enum TodoForms {
    static func body(_ d: TodoDraft, isCreator: Bool) -> (body: [String: Any]?, error: String?) {
        if d.title.trimmingCharacters(in: .whitespaces).isEmpty { return (nil, TodoText.invalid) }
        var rec: [String: Any] = ["kind": d.repeat]
        switch d.repeat {
        case "weekly":
            if d.weekdays.isEmpty { return (nil, TodoText.pickDay) }
            rec["weekdays"] = d.weekdays.sorted()
        case "monthly":
            rec["day"] = d.startDate?.day ?? 1
        default: break
        }
        if d.repeat != "none" && d.startDate == nil { return (nil, TodoText.needsDate) }
        var b: [String: Any] = [
            "title": d.title.trimmingCharacters(in: .whitespaces),
            "assignees": d.assignees,
            "startDate": orNull(d.startDate?.description),
            "time": orNull(d.time?.description),
            "recurrence": rec,
            "until": orNull(d.repeat == "none" ? nil : d.until?.description),
            "needsConfirm": d.needsConfirm,
            "reminders": d.reminders,
        ]
        if isCreator { b["visibility"] = ["everyone": d.visibility.everyone, "memberIds": d.visibility.memberIds] }
        return (b, nil)
    }
}

@MainActor
@Observable
final class TodosModel {
    var view: TodoView = .today
    var mine = true
    private(set) var list: [Occurrence]?
    private(set) var members: [Member] = []
    var error: String?
    let me: Member
    private let api: TodosAPI

    init(api: TodosAPI, me: Member) {
        self.api = api
        self.me = me
    }

    func load() async {
        do {
            if members.isEmpty { members = try await api.members() }
            list = try await api.todos(view: view.rawValue, mine: mine)
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = TodoText.generic
        }
    }

    func setView(_ v: TodoView) async { view = v; await load() }
    func setMine(_ m: Bool) async { mine = m; await load() }
    func onLive(_ e: LiveEvent) async { if e == .todos || e == .connected { await load() } }

    /** Shown at once; goes back if the server says no. */
    func toggle(_ o: Occurrence) async {
        let date = o.date ?? UNDATED
        let before = list
        error = nil
        list = list?.map { x in
            guard x.id == o.id else { return x }
            var c = x
            c.done = o.done == nil ? Done(by: me.id, at: "now") : nil
            return c
        }
        do {
            if o.done != nil { try await api.undone(o.todoId, date: date) } else { try await api.done(o.todoId, date: date) }
            await load()
        } catch {
            list = before
            self.error = TodoText.generic
        }
    }

    func rule(_ id: String) async -> TodoRule? {
        do { return try await api.todo(id) } catch { self.error = TodoText.generic; return nil }
    }

    /** Error to show, or nil when saved. */
    func save(_ rule: TodoRule?, _ d: TodoDraft) async -> String? {
        let r = TodoForms.body(d, isCreator: rule == nil || rule?.createdBy == me.id)
        guard let body = r.body else { return r.error }
        do {
            if let rule { try await api.updateTodo(rule.id, body) } else { try await api.createTodo(body) }
            await load()
            return nil
        } catch {
            return TodoText.invalid
        }
    }

    func delete(_ rule: TodoRule) async {
        do {
            try await api.deleteTodo(rule.id)
            await load()
        } catch {
            self.error = TodoText.generic
        }
    }

    func suggestions(_ q: String) async -> [String] {
        let t = q.trimmingCharacters(in: .whitespaces)
        if t.isEmpty { return [] }
        return ((try? await api.todoSuggestions(t)) ?? []).filter { $0 != q }
    }
}
