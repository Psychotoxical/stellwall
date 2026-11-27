import XCTest
import SwiftUI
@testable import Stellwall

final class FakeCalendar: CalendarAPI {
    func members() async throws -> [Member] { [alexMember, samMember] }
    func calendar(from: Date, to: Date, mine: Bool) async throws -> [CalendarInstance] {
        [.event(EventInstance(eventId: "e1", date: "2026-12-02", start: "2026-12-02T14:30:00.000Z", end: "2026-12-02T15:30:00.000Z", allDay: false, endDate: "2026-12-02", title: "Zahnarzt", location: "Praxis", forWhom: ["sam"], series: false, createdBy: "me", changed: false)),
         .event(EventInstance(eventId: "e2", date: "2026-12-02", start: "2026-12-01T23:00:00.000Z", end: "2026-12-02T23:00:00.000Z", allDay: true, endDate: "2026-12-02", title: "Ausflug", location: "", forWhom: ["me", "sam"], series: false, createdBy: "me", changed: false)),
         .birthday(BirthdayInstance(birthdayId: "b1", date: "2026-12-05", start: "2026-12-04T23:00:00.000Z", endDate: "2026-12-05", title: "Oma", age: 76))]
    }
    func event(_ id: String) async throws -> EventDto { throw OfflineError() }
    func createEvent(_ body: [String: Any]) async throws {}
    func updateEvent(_ id: String, scope: String, date: String?, body: [String: Any]) async throws {}
    func deleteEvent(_ id: String, scope: String, date: String?) async throws {}
    func birthdays() async throws -> [Birthday] { [] }
    func createBirthday(_ body: BirthdayChange) async throws {}
    func updateBirthday(_ id: String, _ body: BirthdayChange) async throws {}
    func deleteBirthday(_ id: String) async throws {}
}

final class FakeTodos: TodosAPI {
    func members() async throws -> [Member] { [alexMember, samMember] }
    func todos(view: String, mine: Bool) async throws -> [Occurrence] {
        [Occurrence(todoId: "t1", title: "Blumen gießen", date: "2026-11-27", at: "2026-11-27T07:00:00.000Z", overdue: false, done: nil, assignees: ["me"], needsConfirm: true, everyone: true, createdBy: "sam"),
         Occurrence(todoId: "t2", title: "Müll rausbringen", date: "2026-11-26", at: nil, overdue: true, done: nil, assignees: ["me", "sam"], needsConfirm: false, everyone: true, createdBy: "me"),
         Occurrence(todoId: "t3", title: "Fahrrad reparieren", date: nil, at: nil, overdue: false, done: Done(by: "sam", at: "2026-11-27T09:00:00.000Z"), assignees: [], needsConfirm: true, everyone: true, createdBy: "me")]
    }
    func todo(_ id: String) async throws -> TodoRule { throw OfflineError() }
    func createTodo(_ body: [String: Any]) async throws {}
    func updateTodo(_ id: String, _ body: [String: Any]) async throws {}
    func deleteTodo(_ id: String) async throws {}
    func done(_ id: String, date: String) async throws {}
    func undone(_ id: String, date: String) async throws {}
    func todoSuggestions(_ q: String) async throws -> [String] { [] }
}

@MainActor
final class PicturesTests: XCTestCase {
    func testTheCalendarMonthWithADayOpen() async {
        let m = CalendarModel(api: FakeCalendar(), me: alexMember, zone: TimeZone(identifier: "Europe/Berlin")!, today: { Day(2026, 12, 2) }, now: { Day(2026, 12, 2).at(Clock(10, 0)) })
        await m.load()
        snap(CalendarView(model: m, birthdays: BirthdaysModel(api: FakeCalendar(), me: alexMember)), world: "himmel", named: "month")
    }

    /** Large text, as on Frank's iPhone: chips move on to the next line and "ganztägig" stays whole. */
    func testTheCalendarWithLargeText() async {
        let m = CalendarModel(api: FakeCalendar(), me: alexMember, zone: TimeZone(identifier: "Europe/Berlin")!, today: { Day(2026, 12, 2) }, now: { Day(2026, 12, 2).at(Clock(10, 0)) })
        await m.setView(.upcoming)
        snap(CalendarView(model: m, birthdays: BirthdaysModel(api: FakeCalendar(), me: alexMember)), world: "pink", text: .extraExtraLarge, named: "upcoming-large-text")
    }

    func testToDosForToday() async {
        let m = TodosModel(api: FakeTodos(), me: alexMember)
        await m.load()
        snap(TodosView(model: m), world: "flieder", dark: true, named: "todos-dark")
    }
}
