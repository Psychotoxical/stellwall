import Foundation

/** A calendar day without a time (LocalDate), written as "2026-11-27" like the server does. */
struct Day: Hashable, Comparable, Codable, CustomStringConvertible {
    let year: Int
    let month: Int
    let day: Int

    init(_ year: Int, _ month: Int, _ day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    init?(_ iso: String) {
        let p = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        self.init(p[0], p[1], p[2])
    }

    init(from decoder: Decoder) throws {
        let s = try decoder.singleValueContainer().decode(String.self)
        guard let d = Day(s) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "not a day: \(s)")) }
        self = d
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(description)
    }

    /** The day a moment falls on in a time zone. */
    init(_ date: Date, zone: TimeZone = .current) {
        let c = Day.calendar(zone).dateComponents([.year, .month, .day], from: date)
        self.init(c.year!, c.month!, c.day!)
    }

    static func today(zone: TimeZone = .current, now: Date = Date()) -> Day { Day(now, zone: zone) }

    static func calendar(_ zone: TimeZone) -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = zone
        c.firstWeekday = 2
        c.locale = Locale(identifier: "de_DE")
        return c
    }

    var description: String { String(format: "%04d-%02d-%02d", year, month, day) }

    /** Noon UTC of the day: a stable anchor for arithmetic that never crosses a day by DST. */
    private var anchor: Date { Day.calendar(TimeZone(identifier: "UTC")!).date(from: DateComponents(year: year, month: month, day: day, hour: 12))! }

    func plus(days n: Int) -> Day { Day(anchor.addingTimeInterval(Double(n) * 86_400), zone: TimeZone(identifier: "UTC")!) }
    func plus(months n: Int) -> Day {
        let c = Day.calendar(TimeZone(identifier: "UTC")!)
        return Day(c.date(byAdding: .month, value: n, to: anchor)!, zone: TimeZone(identifier: "UTC")!)
    }

    func days(to other: Day) -> Int { Int(((other.anchor.timeIntervalSince(anchor)) / 86_400).rounded()) }

    /** Monday = 1 ... Sunday = 7, as ISO counts. */
    var weekday: Int {
        let w = Day.calendar(TimeZone(identifier: "UTC")!).component(.weekday, from: anchor)
        return w == 1 ? 7 : w - 1
    }

    var firstOfMonth: Day { Day(year, month, 1) }
    var weekStart: Day { plus(days: -(weekday - 1)) }

    /** Midnight of the day in a zone, as a moment. */
    func start(zone: TimeZone = .current) -> Date { Day.calendar(zone).date(from: DateComponents(year: year, month: month, day: day))! }

    /** A wall time on this day in a zone. */
    func at(_ time: Clock, zone: TimeZone = .current) -> Date {
        Day.calendar(zone).date(from: DateComponents(year: year, month: month, day: day, hour: time.hour, minute: time.minute))!
    }

    static func < (a: Day, b: Day) -> Bool { (a.year, a.month, a.day) < (b.year, b.month, b.day) }

    func format(_ pattern: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "de_DE")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = pattern
        return f.string(from: anchor)
    }
}

/** A wall time (LocalTime): hour and minute. */
struct Clock: Hashable, Comparable, CustomStringConvertible {
    let hour: Int
    let minute: Int

    init(_ hour: Int, _ minute: Int) {
        self.hour = hour
        self.minute = minute
    }

    init?(_ s: String) {
        let p = s.split(separator: ":").compactMap { Int($0) }
        guard p.count >= 2 else { return nil }
        self.init(p[0], p[1])
    }

    init(_ date: Date, zone: TimeZone = .current) {
        let c = Day.calendar(zone).dateComponents([.hour, .minute], from: date)
        self.init(c.hour!, c.minute!)
    }

    var description: String { String(format: "%02d:%02d", hour, minute) }
    static func < (a: Clock, b: Clock) -> Bool { (a.hour, a.minute) < (b.hour, b.minute) }
}

extension Date {
    /** "2026-11-27T10:00:00.000Z", as the server writes moments. */
    var iso: String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: self)
    }
}
