import Foundation
import Observation

/** The web app's calendar and birthday wording. */
enum CalText {
    static let page = "Kalender"
    static let mine = "Meine"
    static let all = "Alle"
    static let prev = "Zurück"
    static let next = "Weiter"
    static let today = "Heute"
    static let new = "Neuer Termin"
    static let edit = "Termin bearbeiten"
    static let birthdays = "Geburtstage"
    static let allDay = "Ganztägig"
    static let allDayShort = "ganztägig"
    static let title = "Was steht an?"
    static let from = "Von"
    static let to = "Bis"
    static let date = "Datum"
    static let location = "Ort (optional)"
    static let notes = "Notiz (optional)"
    static let forWhom = "Für wen ist der Termin?"
    static let seeAll = "Alle dürfen ihn sehen"
    static let seeAllSub = "Sonst sehen ihn nur die, für die er ist."
    static let `repeat` = "Wiederholen"
    static let reminders = "Erinnern"
    static let reminderChips = [(1440, "1 Tag vorher"), (60, "1 Stunde vorher"), (15, "15 Minuten vorher")]
    static let delete = "Termin löschen"
    static let scopeSave = "Was soll sich ändern?"
    static let scopeDelete = "Was soll gelöscht werden?"
    static let dayEmpty = "An diesem Tag steht nichts an."
    static let weekEmpty = "In dieser Woche steht nichts an."
    static let upcomingEmpty = "In den nächsten 30 Tagen steht nichts an."
    static let generic = "Das hat nicht geklappt. Bitte noch einmal versuchen."
    static let save = "Speichern"
    static let cancel = "Abbrechen"
    static let weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
    static func turns(_ age: Int) -> String { "wird \(age)" }

    static let bPage = "Geburtstage"
    static let bTitle = "Wer hat wann Geburtstag?"
    static let bNew = "Neuer Geburtstag"
    static let bEdit = "Geburtstag bearbeiten"
    static let bName = "Name"
    static let bDay = "Tag"
    static let bMonth = "Monat"
    static let bYear = "Geburtsjahr (optional)"
    static let bYearHint = "Mit Jahr zeigt der Kalender, wie alt jemand wird."
    static let months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]
    static let bRemind = "Erinnern"
    static let remindDays = [(0, "am Tag selbst"), (1, "1 Tag vorher"), (3, "3 Tage vorher"), (7, "1 Woche vorher"), (14, "2 Wochen vorher")]
    static let bRemindWho = "Wer wird erinnert?"
    static let bEmpty = "Noch keine Geburtstage eingetragen."
    static let bDelete = "Geburtstag löschen"
    static let noSuchDay = "Diesen Tag gibt es in dem Monat nicht."
    static func whenText(_ day: Int, _ month: Int) -> String { "\(day). \(months[month - 1])" }
}

protocol CalendarAPI {
    func members() async throws -> [Member]
    func calendar(from: Date, to: Date, mine: Bool) async throws -> [CalendarInstance]
    func event(_ id: String) async throws -> EventDto
    func createEvent(_ body: [String: Any]) async throws
    func updateEvent(_ id: String, scope: String, date: String?, body: [String: Any]) async throws
    func deleteEvent(_ id: String, scope: String, date: String?) async throws
    func birthdays() async throws -> [Birthday]
    func createBirthday(_ body: BirthdayChange) async throws
    func updateBirthday(_ id: String, _ body: BirthdayChange) async throws
    func deleteBirthday(_ id: String) async throws
}

extension APIClient: CalendarAPI {
    func calendar(from: Date, to: Date, mine: Bool) async throws -> [CalendarInstance] {
        CalendarInstance.parse(try await send("GET", "api/calendar", query: [("from", from.iso), ("to", to.iso), ("mine", mine ? "1" : nil)]))
    }

    func event(_ id: String) async throws -> EventDto { try await json(EventDto.self, "GET", "api/events/\(id)") }
    func createEvent(_ body: [String: Any]) async throws { try await send("POST", "api/events", body: try JSONSerialization.data(withJSONObject: body)) }
    func updateEvent(_ id: String, scope: String, date: String?, body: [String: Any]) async throws {
        try await send("PATCH", "api/events/\(id)", query: [("scope", scope), ("date", date)], body: try JSONSerialization.data(withJSONObject: body))
    }
    func deleteEvent(_ id: String, scope: String, date: String?) async throws { try await send("DELETE", "api/events/\(id)", query: [("scope", scope), ("date", date)]) }
    func birthdays() async throws -> [Birthday] { try await json([Birthday].self, "GET", "api/birthdays") }
    func createBirthday(_ body: BirthdayChange) async throws { try await send("POST", "api/birthdays", body: try APIClient.encoder.encode(body)) }
    func updateBirthday(_ id: String, _ body: BirthdayChange) async throws { try await send("PATCH", "api/birthdays/\(id)", body: try APIClient.encoder.encode(body)) }
    func deleteBirthday(_ id: String) async throws { try await send("DELETE", "api/birthdays/\(id)") }
}

/** An open event form: the event (nil for a new one), the occurrence tapped, and what the form started with. */
struct EventForm: Identifiable {
    let event: EventDto?
    let instance: EventInstance?
    let start0: EventDraft
    let isCreator: Bool
    var isSeries: Bool { event?.rrule != nil }
    var id: String { (event?.id ?? "new") + (instance?.date ?? "") }
}

@MainActor
@Observable
final class CalendarModel {
    var view: CalView = .month
    private(set) var sel: Day
    private(set) var today: Day
    var mine = false
    private(set) var days: [Day: [CalendarInstance]] = [:]
    private(set) var members: [Member] = []
    private(set) var loaded = false
    var error: String?
    let me: Member
    private let api: CalendarAPI
    let zone: TimeZone
    private let todayFn: () -> Day
    private let now: () -> Date

    init(api: CalendarAPI, me: Member, zone: TimeZone = .current, today: @escaping () -> Day = { Day.today() }, now: @escaping () -> Date = { Date() }) {
        self.api = api
        self.me = me
        self.zone = zone
        self.todayFn = today
        self.now = now
        self.sel = today()
        self.today = today()
    }

    var range: (Day, Day) { Days.range(view, sel: sel, today: today) }

    var title: String {
        switch view {
        case .month: Days.monthTitle(sel)
        case .week: Days.weekTitle(range.0)
        case .upcoming: CalView.upcoming.rawValue
        }
    }

    func load() async {
        today = todayFn()
        let (from, to) = range
        do {
            if members.isEmpty { members = try await api.members() }
            let list = try await api.calendar(from: from.start(zone: zone), to: to.start(zone: zone), mine: mine)
            days = Days.byDay(list, zone: zone)
            loaded = true
            error = nil
        } catch is CancellationError {
        } catch {
            loaded = true
            self.error = CalText.generic
        }
    }

    func setView(_ v: CalView) async { view = v; await load() }
    func setMine(_ m: Bool) async { mine = m; await load() }

    /** Picking a day in the month grid needs no reload while it stays in the shown weeks. */
    func select(_ d: Day) async {
        let before = range
        sel = d
        if range != before { await load() }
    }

    func step(_ n: Int) async { await select(view == .month ? sel.firstOfMonth.plus(months: n) : sel.plus(days: 7 * n)) }
    func goToday() async { await select(todayFn()) }
    func onLive(_ e: LiveEvent) async { if e == .calendar || e == .connected { await load() } }

    func newForm(_ date: Day) -> EventForm {
        EventForm(event: nil, instance: nil, start0: EventForms.initial(nil, nil, defaultDate: date, meId: me.id, now: now(), zone: zone), isCreator: true)
    }

    /** nil when the event could not be fetched; the error then shows on the page. */
    func open(_ i: EventInstance) async -> EventForm? {
        do {
            let ev = try await api.event(i.eventId)
            return EventForm(event: ev, instance: i, start0: EventForms.initial(ev, i, defaultDate: Day(i.date)!, meId: me.id, now: now(), zone: zone), isCreator: ev.createdBy == me.id)
        } catch {
            self.error = CalText.generic
            return nil
        }
    }

    /** Returns the error to show, or nil when saved. `scope` is asked for series only. */
    func save(_ form: EventForm, _ d: EventDraft, scope: Scope?) async -> String? {
        if let e = EventForms.validate(d, zone: zone) { return e }
        return await run {
            if let ev = form.event {
                let sc = form.isSeries ? (scope ?? .all) : .all
                try await api.updateEvent(ev.id, scope: sc.rawValue, date: form.isSeries ? (form.instance?.date ?? ev.startDate) : nil,
                                          body: EventForms.updateBody(ev, start0: form.start0, d, scope: sc, isCreator: form.isCreator, zone: zone))
            } else {
                try await api.createEvent(EventForms.createBody(d, zone: zone))
            }
        }
    }

    func delete(_ form: EventForm, scope: Scope) async -> String? {
        guard let ev = form.event else { return nil }
        return await run { try await api.deleteEvent(ev.id, scope: scope.rawValue, date: form.isSeries ? (form.instance?.date ?? ev.startDate) : nil) }
    }

    private func run(_ block: () async throws -> Void) async -> String? {
        do {
            try await block()
            await load()
            return nil
        } catch {
            return CalText.generic
        }
    }
}

@MainActor
@Observable
final class BirthdaysModel {
    private(set) var list: [Birthday]?
    private(set) var members: [Member] = []
    let me: Member
    private let api: CalendarAPI
    private let today: () -> Day

    init(api: CalendarAPI, me: Member, today: @escaping () -> Day = { Day.today() }) {
        self.api = api
        self.me = me
        self.today = today
    }

    func load() async {
        if members.isEmpty, let m = try? await api.members() { members = m }
        if let l = try? await api.birthdays() { list = l }
    }

    /** "wird 76": the age at the next birthday, counted from today. */
    func turns(_ b: Birthday) -> String? {
        guard let y = b.year else { return nil }
        let t = today()
        let past = b.month < t.month || (b.month == t.month && b.day < t.day)
        return CalText.turns(t.year - y + (past ? 1 : 0))
    }

    func save(_ existing: Birthday?, _ change: BirthdayChange) async -> String? {
        let length = Day(2024, change.month, 1).plus(months: 1).plus(days: -1).day
        if change.day > length { return CalText.noSuchDay }
        if change.name.trimmingCharacters(in: .whitespaces).isEmpty { return EventForms.invalid }
        let isCreator = existing == nil || existing?.createdBy == me.id
        var body = change
        body.name = change.name.trimmingCharacters(in: .whitespaces)
        if !isCreator { body.visibility = nil }
        do {
            if let existing { try await api.updateBirthday(existing.id, body) } else { try await api.createBirthday(body) }
            await load()
            return nil
        } catch let e as APIError where e.status == 400 {
            return EventForms.invalid
        } catch {
            return CalText.generic
        }
    }

    func delete(_ b: Birthday) async {
        try? await api.deleteBirthday(b.id)
        await load()
    }
}
