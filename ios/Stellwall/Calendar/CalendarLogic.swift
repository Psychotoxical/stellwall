import Foundation

/** One entry in the calendar for a range: an event occurrence or a birthday. */
enum CalendarInstance: Equatable, Identifiable {
    case event(EventInstance)
    case birthday(BirthdayInstance)

    var id: String {
        switch self {
        case let .event(e): "e\(e.eventId)\(e.date)"
        case let .birthday(b): "b\(b.birthdayId)\(b.date)"
        }
    }

    /** Local date of the occurrence in its series (the key for changes to one occurrence). */
    var date: String { switch self { case let .event(e): e.date; case let .birthday(b): b.date } }
    var start: String { switch self { case let .event(e): e.start; case let .birthday(b): b.start } }
    var allDay: Bool { switch self { case let .event(e): e.allDay; case .birthday: true } }
    /** Last day of an all-day entry, inclusive. */
    var endDate: String { switch self { case let .event(e): e.endDate; case let .birthday(b): b.endDate } }
    var title: String { switch self { case let .event(e): e.title; case let .birthday(b): b.title } }

    static func parse(_ data: Data) -> [CalendarInstance] {
        guard let rows = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else { return [] }
        let dec = JSONDecoder()
        return rows.compactMap { r in
            guard let d = try? JSONSerialization.data(withJSONObject: r) else { return nil }
            switch r["kind"] as? String {
            case "event": return (try? dec.decode(EventInstance.self, from: d)).map { .event($0) }
            case "birthday": return (try? dec.decode(BirthdayInstance.self, from: d)).map { .birthday($0) }
            default: return nil
            }
        }
    }
}

struct EventInstance: Codable, Equatable {
    let eventId: String
    let date: String
    let start: String
    let end: String
    let allDay: Bool
    let endDate: String
    let title: String
    let location: String
    let forWhom: [String]
    let series: Bool
    let createdBy: String
    let changed: Bool
}

struct BirthdayInstance: Codable, Equatable {
    let birthdayId: String
    let date: String
    let start: String
    let endDate: String
    let title: String
    let age: Int?
}

struct EventDto: Codable, Equatable {
    let id: String
    let title: String
    let location: String
    let notes: String
    let allDay: Bool
    let start: String
    let end: String
    let startDate: String
    let endDate: String
    let rrule: String?
    let forWhom: [String]
    let seeAll: Bool
    let createdBy: String
    let reminders: [Int]
    let imported: Bool
}

struct Birthday: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let month: Int
    let day: Int
    let year: Int?
    let visibility: Visibility
    let remindDays: Int
    let remindWho: [String]
    let createdBy: String
}

struct BirthdayChange: Codable, Equatable {
    var name: String
    var day: Int
    var month: Int
    var year: Int?
    var remindDays: Int
    var remindWho: [String]
    /** Only the creator may send it. */
    var visibility: Visibility?

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(name, forKey: .name)
        try c.encode(day, forKey: .day)
        try c.encode(month, forKey: .month)
        if let year { try c.encode(year, forKey: .year) } else { try c.encodeNil(forKey: .year) }
        try c.encode(remindDays, forKey: .remindDays)
        try c.encode(remindWho, forKey: .remindWho)
        try c.encodeIfPresent(visibility, forKey: .visibility)
    }
}

enum CalView: String, CaseIterable { case month = "Monat", week = "Woche", upcoming = "Demnächst" }

enum Repeat: String, CaseIterable { case none = "Nie", weekly = "Wöchentlich", biweekly = "Alle 2 Wochen", monthly = "Monatlich", yearly = "Jährlich", custom = "" }

/** The simple repeat rules of the web app, so both write the same RRULE. */
enum Rules {
    private static let codes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
    private static let names = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]

    static func simple(_ kind: Repeat, start: Day) -> String {
        let wd = codes[start.weekday - 1]
        switch kind {
        case .weekly: return "FREQ=WEEKLY;BYDAY=\(wd)"
        case .biweekly: return "FREQ=WEEKLY;INTERVAL=2;BYDAY=\(wd)"
        case .monthly: return "FREQ=MONTHLY;BYMONTHDAY=\(start.day)"
        default: return "FREQ=YEARLY"
        }
    }

    private static func matches(_ s: String, _ pattern: String) -> Bool { s.range(of: pattern, options: .regularExpression) != nil }

    static func kind(_ rrule: String?) -> Repeat {
        guard let rrule else { return .none }
        let r = rrule.replacingOccurrences(of: ";UNTIL=[^;]+", with: "", options: .regularExpression)
        if matches(r, "^FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$") { return .weekly }
        if matches(r, "^FREQ=WEEKLY;INTERVAL=2;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$") { return .biweekly }
        if matches(r, "^FREQ=MONTHLY;BYMONTHDAY=\\d{1,2}$") { return .monthly }
        if r == "FREQ=YEARLY" { return .yearly }
        return .custom
    }

    private static func capture(_ s: String, _ pattern: String) -> String? {
        guard let re = try? NSRegularExpression(pattern: pattern), let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)), let r = Range(m.range(at: 1), in: s) else { return nil }
        return String(s[r])
    }

    static func describe(_ rrule: String) -> String {
        let code = capture(rrule, "BYDAY=([A-Z]{2})")
        let day = code.flatMap { codes.firstIndex(of: $0) }.map { names[$0] } ?? ""
        switch kind(rrule) {
        case .weekly: return "jeden \(day)"
        case .biweekly: return "alle 2 Wochen am \(day)"
        case .monthly: return "monatlich am \(capture(rrule, "BYMONTHDAY=(\\d+)") ?? "")."
        case .yearly: return "jährlich"
        default: return "eigene Wiederholung"
        }
    }

    /** The end of a series that was split earlier, so a changed rule keeps it. */
    static func until(_ rrule: String?) -> String {
        guard let rrule, let r = rrule.range(of: ";UNTIL=[^;]+", options: .regularExpression) else { return "" }
        return String(rrule[r])
    }
}

/** Calendar days in the device's zone, as the web app shows them. */
enum Days {
    static let upcomingDays = 30

    /** The dates a view fetches: [from, to). */
    static func range(_ view: CalView, sel: Day, today: Day) -> (Day, Day) {
        switch view {
        case .month:
            let s = sel.firstOfMonth.weekStart
            return (s, s.plus(days: 42))
        case .week:
            let s = sel.weekStart
            return (s, s.plus(days: 7))
        case .upcoming:
            return (today, today.plus(days: upcomingDays))
        }
    }

    static func dayOf(_ i: CalendarInstance, zone: TimeZone) -> Day { ISO8601.date(i.start).map { Day($0, zone: zone) } ?? Day(i.date)! }

    static func datesOf(_ i: CalendarInstance, zone: TimeZone) -> [Day] {
        let first = dayOf(i, zone: zone)
        guard i.allDay, let last = Day(i.endDate) else { return [first] }
        var out: [Day] = []
        var d = first
        while d <= last && out.count < 62 {
            out.append(d)
            d = d.plus(days: 1)
        }
        return out
    }

    static func byDay(_ list: [CalendarInstance], zone: TimeZone) -> [Day: [CalendarInstance]] {
        var m: [Day: [CalendarInstance]] = [:]
        for i in list { for d in datesOf(i, zone: zone) { m[d, default: []].append(i) } }
        return m.mapValues { $0.sorted { a, b in a.allDay != b.allDay ? a.allDay : a.start < b.start } }
    }

    static func hhmm(_ iso: String, zone: TimeZone = .current) -> String { ISO8601.date(iso).map { Clock($0, zone: zone).description } ?? "" }
    static func dayLabel(_ d: Day) -> String { d.format("EEEE, d. MMMM") }
    static func monthTitle(_ d: Day) -> String { d.format("MMMM yyyy") }
    static func weekTitle(_ start: Day) -> String { "\(start.format("d. MMM")) – \(start.plus(days: 6).format("d. MMM"))" }
    static func weekdayShort(_ d: Day) -> String { d.format("EE").replacingOccurrences(of: ".", with: "") }
    static func monthShort(_ d: Day) -> String { d.format("MMM").replacingOccurrences(of: ".", with: "") }
    static func dateShort(_ d: Day) -> String { d.format("EE, d.M.yyyy") }
}

enum Scope: String, CaseIterable {
    case one, following, all

    var label: String {
        switch self {
        case .one: "Nur dieser Termin"
        case .following: "Dieser und alle folgenden"
        case .all: "Alle Termine der Serie"
        }
    }
}

enum Ask { case save, delete }

/** What the event form holds; times are local wall times. */
struct EventDraft: Equatable {
    var title: String
    var allDay: Bool
    var startDate: Day
    var startTime: Clock
    var endDate: Day
    var endTime: Clock
    var location: String
    var notes: String
    var forWhom: [String]
    var seeAll: Bool
    var `repeat`: Repeat
    var reminders: [Int]
}

/** The web app's event form logic: a new event, or a change that names which occurrences of a series it is meant for. */
enum EventForms {
    static let invalid = "Bitte die Eingaben prüfen."
    static let pickPerson = "Wähle mindestens eine Person."
    static let endBeforeStart = "Das Ende liegt vor dem Anfang."

    static func initial(_ ev: EventDto?, _ inst: EventInstance?, defaultDate: Day, meId: String, now: Date, zone: TimeZone) -> EventDraft {
        guard let ev else {
            let h = Clock(now, zone: zone).hour
            return EventDraft(title: "", allDay: false, startDate: defaultDate, startTime: Clock(min(h + 1, 22), 0), endDate: defaultDate, endTime: Clock(min(h + 2, 23), 0),
                              location: "", notes: "", forWhom: [meId], seeAll: false, repeat: .none, reminders: [])
        }
        let start = ISO8601.date(inst?.start ?? ev.start) ?? Date()
        let end = ISO8601.date(inst?.end ?? ev.end) ?? Date()
        return EventDraft(
            title: inst?.title ?? ev.title,
            allDay: ev.allDay,
            startDate: inst.map { Days.dayOf(.event($0), zone: zone) } ?? Day(ev.startDate)!,
            startTime: ev.allDay ? Clock(9, 0) : Clock(start, zone: zone),
            endDate: ev.allDay ? Day(inst?.endDate ?? ev.endDate)! : Day(end, zone: zone),
            endTime: ev.allDay ? Clock(10, 0) : Clock(end, zone: zone),
            location: inst?.location ?? ev.location,
            notes: ev.notes,
            forWhom: ev.forWhom,
            seeAll: ev.seeAll,
            repeat: Rules.kind(ev.rrule),
            reminders: ev.reminders
        )
    }

    static func validate(_ d: EventDraft, zone: TimeZone = .current) -> String? {
        if d.title.trimmingCharacters(in: .whitespaces).isEmpty { return invalid }
        if d.forWhom.isEmpty { return pickPerson }
        if d.allDay ? d.endDate < d.startDate : !(d.endDate.at(d.endTime, zone: zone) > d.startDate.at(d.startTime, zone: zone)) { return endBeforeStart }
        return nil
    }

    private static func timeFields(_ d: EventDraft, _ startDate: Day, _ endDate: Day, _ start: Date, _ end: Date) -> [String: Any] {
        d.allDay ? ["allDay": true, "startDate": startDate.description, "endDate": endDate.description] : ["allDay": false, "start": start.iso, "end": end.iso]
    }

    /** A simple rule follows the start day; an end set earlier (a split series) stays. */
    private static func ruleFor(_ d: EventDraft, _ ev: EventDto?, _ startDate: Day) -> String? {
        switch d.repeat {
        case .none: return nil
        case .custom: return ev?.rrule
        default: return Rules.simple(d.repeat, start: startDate) + Rules.until(ev?.rrule)
        }
    }

    static func createBody(_ d: EventDraft, zone: TimeZone) -> [String: Any] {
        var b: [String: Any] = [
            "title": d.title.trimmingCharacters(in: .whitespaces),
            "location": d.location.trimmingCharacters(in: .whitespaces),
            "notes": d.notes.trimmingCharacters(in: .whitespacesAndNewlines),
            "rrule": orNull(ruleFor(d, nil, d.startDate)),
            "forWhom": d.forWhom,
            "seeAll": d.seeAll,
            "reminders": d.reminders,
        ]
        b.merge(timeFields(d, d.startDate, d.endDate, d.startDate.at(d.startTime, zone: zone), d.endDate.at(d.endTime, zone: zone))) { $1 }
        return b
    }

    private static func timesChanged(_ a: EventDraft, _ b: EventDraft) -> Bool {
        a.allDay != b.allDay || a.startDate != b.startDate || a.endDate != b.endDate || (!b.allDay && (a.startTime != b.startTime || a.endTime != b.endTime))
    }

    /** Notes, reminders, people, visibility and the rule belong to the whole series. */
    static func seriesOnly(_ start0: EventDraft, _ d: EventDraft) -> Bool {
        d.notes.trimmingCharacters(in: .whitespacesAndNewlines) != start0.notes || d.reminders != start0.reminders || d.forWhom != start0.forWhom || d.seeAll != start0.seeAll || d.repeat != start0.repeat || d.allDay != start0.allDay
    }

    static func scopes(_ ask: Ask, isCreator: Bool, seriesOnly: Bool) -> [Scope] {
        if ask == .delete { return isCreator ? Scope.allCases : [.one] }
        return seriesOnly ? [.following, .all] : Scope.allCases
    }

    static func updateBody(_ ev: EventDto, start0: EventDraft, _ d: EventDraft, scope: Scope, isCreator: Bool, zone: TimeZone) -> [String: Any] {
        let isSeries = ev.rrule != nil
        var body: [String: Any] = [:]
        let title = d.title.trimmingCharacters(in: .whitespaces), location = d.location.trimmingCharacters(in: .whitespaces), notes = d.notes.trimmingCharacters(in: .whitespacesAndNewlines)
        if title != start0.title { body["title"] = title }
        if location != start0.location { body["location"] = location }
        if scope != .one {
            if notes != start0.notes { body["notes"] = notes }
            if d.reminders != start0.reminders { body["reminders"] = d.reminders }
            if d.forWhom != start0.forWhom { body["forWhom"] = d.forWhom }
            if isCreator && d.seeAll != start0.seeAll { body["seeAll"] = d.seeAll }
        }
        var seriesStart = scope == .following ? d.startDate : Day(ev.startDate)!
        if timesChanged(start0, d) {
            if scope != .all || !isSeries {
                body.merge(timeFields(d, d.startDate, d.endDate, d.startDate.at(d.startTime, zone: zone), d.endDate.at(d.endTime, zone: zone))) { $1 }
            } else if d.allDay {
                // The whole series moves by the same amount as the occurrence that was edited.
                seriesStart = Day(ev.startDate)!.plus(days: start0.startDate.days(to: d.startDate))
                let end = seriesStart.plus(days: d.startDate.days(to: d.endDate))
                body.merge(timeFields(d, seriesStart, end, Date(timeIntervalSince1970: 0), Date(timeIntervalSince1970: 0))) { $1 }
            } else {
                let base: Date = d.allDay != start0.allDay
                    ? Day(ev.startDate)!.at(d.startTime, zone: zone)
                    : (ISO8601.date(ev.start) ?? Date()).addingTimeInterval(d.startDate.at(d.startTime, zone: zone).timeIntervalSince(start0.startDate.at(start0.startTime, zone: zone)))
                let len = d.endDate.at(d.endTime, zone: zone).timeIntervalSince(d.startDate.at(d.startTime, zone: zone))
                seriesStart = Day(base, zone: zone)
                body.merge(timeFields(d, seriesStart, seriesStart, base, base.addingTimeInterval(len))) { $1 }
            }
        }
        if scope != .one {
            let rule = ruleFor(d, ev, seriesStart)
            if rule != ev.rrule { body["rrule"] = orNull(rule) }
        }
        return body
    }
}
