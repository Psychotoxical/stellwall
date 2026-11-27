import XCTest
@testable import Stellwall

private let berlin = TimeZone(identifier: "Europe/Berlin")!

private func ev(_ id: String, _ start: String, _ end: String, _ allDay: Bool, _ endDate: String) -> CalendarInstance {
    .event(EventInstance(eventId: id, date: String(start.prefix(10)), start: start, end: end, allDay: allDay, endDate: endDate, title: id, location: "", forWhom: ["a"], series: false, createdBy: "a", changed: false))
}

private let series = EventDto(id: "s1", title: "Training", location: "", notes: "", allDay: false, start: "2026-12-01T17:00:00.000Z", end: "2026-12-01T18:30:00.000Z",
                              startDate: "2026-12-01", endDate: "2026-12-01", rrule: "FREQ=WEEKLY;BYDAY=TU", forWhom: ["sam"], seeAll: false, createdBy: "me", reminders: [], imported: false)
private let secondTuesday = EventInstance(eventId: "s1", date: "2026-12-08", start: "2026-12-08T17:00:00.000Z", end: "2026-12-08T18:30:00.000Z", allDay: false, endDate: "2026-12-08",
                                          title: "Training", location: "", forWhom: ["sam"], series: true, createdBy: "me", changed: false)
private let now = Day(2026, 11, 27).at(Clock(10, 20), zone: berlin)

final class CalendarLogicTests: XCTestCase {
    let tue = Day(2026, 12, 1)

    func testSimpleRulesFollowTheStartDay() {
        XCTAssertEqual(Rules.simple(.weekly, start: tue), "FREQ=WEEKLY;BYDAY=TU")
        XCTAssertEqual(Rules.simple(.biweekly, start: tue), "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU")
        XCTAssertEqual(Rules.simple(.monthly, start: tue), "FREQ=MONTHLY;BYMONTHDAY=1")
        XCTAssertEqual(Rules.simple(.yearly, start: tue), "FREQ=YEARLY")
    }

    func testARuleReadsBackAsItsKind() {
        XCTAssertEqual(Rules.kind(nil), Repeat.none)
        XCTAssertEqual(Rules.kind("FREQ=WEEKLY;BYDAY=TU;UNTIL=20270101"), .weekly)
        XCTAssertEqual(Rules.kind("FREQ=WEEKLY;INTERVAL=2;BYDAY=FR"), .biweekly)
        XCTAssertEqual(Rules.kind("FREQ=MONTHLY;BYMONTHDAY=15"), .monthly)
        XCTAssertEqual(Rules.kind("FREQ=DAILY;COUNT=3"), .custom)
    }

    func testRulesInWords() {
        XCTAssertEqual(Rules.describe("FREQ=WEEKLY;BYDAY=TU"), "jeden Dienstag")
        XCTAssertEqual(Rules.describe("FREQ=WEEKLY;INTERVAL=2;BYDAY=FR"), "alle 2 Wochen am Freitag")
        XCTAssertEqual(Rules.describe("FREQ=MONTHLY;BYMONTHDAY=15"), "monatlich am 15.")
        XCTAssertEqual(Rules.describe("FREQ=YEARLY"), "jährlich")
        XCTAssertEqual(Rules.describe("FREQ=DAILY"), "eigene Wiederholung")
    }

    func testWeeksStartOnMondayTheMonthGridShowsSix() {
        XCTAssertEqual(Day(2026, 11, 29).weekStart, Day(2026, 11, 23))
        XCTAssertEqual(Day(2026, 11, 30).weekStart, Day(2026, 11, 30))
        let (from, to) = Days.range(.month, sel: Day(2026, 12, 17), today: Day(2026, 12, 17))
        XCTAssertEqual(from, Day(2026, 11, 30))
        XCTAssertEqual(to, Day(2027, 1, 11))
        let w = Days.range(.week, sel: Day(2026, 12, 17), today: Day(2026, 12, 17))
        XCTAssertEqual([w.0, w.1], [Day(2026, 12, 14), Day(2026, 12, 21)])
        let u = Days.range(.upcoming, sel: Day(2026, 12, 1), today: Day(2026, 12, 17))
        XCTAssertEqual([u.0, u.1], [Day(2026, 12, 17), Day(2027, 1, 16)])
    }

    func testAMultiDayAllDayEventIsOnEachOfItsDays() {
        let trip = ev("trip", "2026-12-04T23:00:00.000Z", "2026-12-06T23:00:00.000Z", true, "2026-12-06")
        let dentist = ev("dentist", "2026-12-05T14:30:00.000Z", "2026-12-05T15:30:00.000Z", false, "2026-12-05")
        let early = ev("early", "2026-12-05T07:00:00.000Z", "2026-12-05T08:00:00.000Z", false, "2026-12-05")
        let days = Days.byDay([dentist, trip, early], zone: berlin)
        XCTAssertEqual(days[Day(2026, 12, 5)]?.map(\.title), ["trip", "early", "dentist"])
        XCTAssertEqual(days[Day(2026, 12, 6)]?.map(\.title), ["trip"])
        XCTAssertNil(days[Day(2026, 12, 7)])
    }

    func testTimesAndLabels() {
        XCTAssertEqual(Days.hhmm("2026-12-02T14:30:00.000Z", zone: berlin), "15:30")
        XCTAssertEqual(Days.dayLabel(Day(2026, 12, 2)), "Mittwoch, 2. Dezember")
        XCTAssertEqual(Days.monthTitle(Day(2026, 12, 2)), "Dezember 2026")
        XCTAssertEqual(Days.weekTitle(Day(2026, 11, 30)), "30. Nov. – 6. Dez.")
    }

    func testANewEventStartsAtTheNextHourForMe() {
        let d = EventForms.initial(nil, nil, defaultDate: Day(2026, 12, 3), meId: "me", now: now, zone: berlin)
        XCTAssertEqual(d.startDate, Day(2026, 12, 3))
        XCTAssertEqual(d.startTime, Clock(11, 0))
        XCTAssertEqual(d.endTime, Clock(12, 0))
        XCTAssertEqual(d.forWhom, ["me"])
    }

    func testAnOccurrenceOpensWithItsOwnDayAndTime() {
        let d = EventForms.initial(series, secondTuesday, defaultDate: Day(2026, 12, 8), meId: "me", now: now, zone: berlin)
        XCTAssertEqual(d.startDate, Day(2026, 12, 8))
        XCTAssertEqual(d.startTime, Clock(18, 0))
        XCTAssertEqual(d.endTime, Clock(19, 30))
        XCTAssertEqual(d.repeat, .weekly)
    }

    func testWhatIsWrongWithADraft() {
        var ok = EventForms.initial(nil, nil, defaultDate: Day(2026, 12, 3), meId: "me", now: now, zone: berlin)
        ok.title = "Zahnarzt"
        XCTAssertNil(EventForms.validate(ok, zone: berlin))
        var t = ok; t.title = " "
        XCTAssertEqual(EventForms.validate(t, zone: berlin), "Bitte die Eingaben prüfen.")
        var f = ok; f.forWhom = []
        XCTAssertEqual(EventForms.validate(f, zone: berlin), "Wähle mindestens eine Person.")
        var e = ok; e.endTime = Clock(10, 0)
        XCTAssertEqual(EventForms.validate(e, zone: berlin), "Das Ende liegt vor dem Anfang.")
    }

    func testANewTimedEventIsSentWithInstantsAnAllDayOneWithDates() {
        var d = EventForms.initial(nil, nil, defaultDate: Day(2026, 12, 3), meId: "me", now: now, zone: berlin)
        d.title = " Zahnarzt "
        d.repeat = .weekly
        let body = EventForms.createBody(d, zone: berlin)
        XCTAssertEqual(body["title"] as? String, "Zahnarzt")
        XCTAssertEqual(body["start"] as? String, "2026-12-03T10:00:00.000Z")
        XCTAssertEqual(body["rrule"] as? String, "FREQ=WEEKLY;BYDAY=TH")
        d.allDay = true
        d.endDate = Day(2026, 12, 4)
        d.repeat = .none
        let allDay = EventForms.createBody(d, zone: berlin)
        XCTAssertEqual(allDay["startDate"] as? String, "2026-12-03")
        XCTAssertNil(allDay["start"])
        XCTAssertTrue(allDay["rrule"] is NSNull)
    }

    func testChangingOneOccurrenceSendsOnlyTitlePlaceAndItsOwnTime() {
        let start0 = EventForms.initial(series, secondTuesday, defaultDate: Day(2026, 12, 8), meId: "me", now: now, zone: berlin)
        var d = start0
        d.title = "Training (Halle 2)"
        d.startTime = Clock(18, 30)
        d.endTime = Clock(20, 0)
        d.notes = "ignored for one"
        let body = EventForms.updateBody(series, start0: start0, d, scope: .one, isCreator: true, zone: berlin)
        XCTAssertEqual(Set(body.keys), ["title", "allDay", "start", "end"])
        XCTAssertEqual(body["start"] as? String, "2026-12-08T17:30:00.000Z")
    }

    func testMovingTheWholeSeriesShiftsItByTheSameAmount() {
        let start0 = EventForms.initial(series, secondTuesday, defaultDate: Day(2026, 12, 8), meId: "me", now: now, zone: berlin)
        var d = start0
        d.startDate = Day(2026, 12, 9)
        d.endDate = Day(2026, 12, 9)
        let body = EventForms.updateBody(series, start0: start0, d, scope: .all, isCreator: true, zone: berlin)
        XCTAssertEqual(body["start"] as? String, "2026-12-02T17:00:00.000Z")
        XCTAssertEqual(body["end"] as? String, "2026-12-02T18:30:00.000Z")
        XCTAssertEqual(body["rrule"] as? String, "FREQ=WEEKLY;BYDAY=WE")
    }

    func testThisAndFollowingStartsTheNewPartAtTheOccurrence() {
        let start0 = EventForms.initial(series, secondTuesday, defaultDate: Day(2026, 12, 8), meId: "me", now: now, zone: berlin)
        var d = start0
        d.startTime = Clock(19, 0)
        d.endTime = Clock(20, 0)
        let body = EventForms.updateBody(series, start0: start0, d, scope: .following, isCreator: true, zone: berlin)
        XCTAssertEqual(body["start"] as? String, "2026-12-08T18:00:00.000Z")
        XCTAssertNil(body["rrule"])
    }

    func testSeriesWideChangesSkipOneOccurrenceOnlyCreatorsDeleteMore() {
        let start0 = EventForms.initial(series, secondTuesday, defaultDate: Day(2026, 12, 8), meId: "me", now: now, zone: berlin)
        var n = start0; n.notes = "neu"
        XCTAssertTrue(EventForms.seriesOnly(start0, n))
        var t = start0; t.title = "neu"
        XCTAssertFalse(EventForms.seriesOnly(start0, t))
        XCTAssertEqual(EventForms.scopes(.save, isCreator: true, seriesOnly: true), [.following, .all])
        XCTAssertEqual(EventForms.scopes(.save, isCreator: false, seriesOnly: false), [.one, .following, .all])
        XCTAssertEqual(EventForms.scopes(.delete, isCreator: false, seriesOnly: false), [.one])
    }

    func testTheCalendarReadsAsTheServerSendsIt() {
        let list = CalendarInstance.parse(Contract.load("calendar").body)
        XCTAssertFalse(list.isEmpty)
        let ev = try? JSONDecoder().decode(EventDto.self, from: Contract.load("event").body)
        XCTAssertNotNil(ev)
        XCTAssertNotNil(try? JSONDecoder().decode([Birthday].self, from: Contract.load("birthdays").body))
    }
}
