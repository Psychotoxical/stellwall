import SwiftUI

/** "Heute für dich" on Start: today's lunch, my events today and my to-dos for today. Each part may fail alone. */
@MainActor
@Observable
final class TodayModel {
    private(set) var lunch: Meal?
    private(set) var events: [CalendarInstance] = []
    private(set) var todos: [Occurrence] = []
    private(set) var members: [Member] = []
    private(set) var loaded = false
    private let todosAPI: TodosAPI
    private let calendarAPI: CalendarAPI
    private let mealsAPI: MealsAPI
    private let zone: TimeZone
    private let today: () -> Day

    init(todos: TodosAPI, calendar: CalendarAPI, meals: MealsAPI, zone: TimeZone = .current, today: @escaping () -> Day = { Day.today() }) {
        self.todosAPI = todos
        self.calendarAPI = calendar
        self.mealsAPI = meals
        self.zone = zone
        self.today = today
    }

    func load() async {
        let d = today()
        if let m = try? await mealsAPI.meals(week: d.weekStart.description) { lunch = m.first { $0.date == d.description } }
        if let e = try? await calendarAPI.calendar(from: d.start(zone: zone), to: d.plus(days: 1).start(zone: zone), mine: true) { events = e }
        if let t = try? await todosAPI.todos(view: "today", mine: true) { todos = t }
        if members.isEmpty, let m = try? await todosAPI.members() { members = m }
        loaded = true
    }

    func onLive(_ e: LiveEvent) async {
        if case .list = e { return }
        if e != .lists { await load() }
    }

    func toggle(_ o: Occurrence) async {
        if o.done != nil { try? await todosAPI.undone(o.todoId, date: o.date ?? UNDATED) } else { try? await todosAPI.done(o.todoId, date: o.date ?? UNDATED) }
        await load()
    }
}

struct TodayView: View {
    let model: TodayModel
    var today = Day.today()
    let onOpen: (Target) -> Void
    @Environment(\.palette) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHead(title: TodoText.myToday)
            if let lunch = model.lunch {
                let what = lunch.recipe?.name ?? lunch.text ?? ""
                BoxCard {
                    Button {
                        onOpen(Target(tab: .essen, cook: lunch.recipe.map { CookTarget(slug: $0.slug, servings: lunch.servings, date: today) }))
                    } label: {
                        HStack(spacing: 12) {
                            Icons.meals.image.resizable().frame(width: 28, height: 28)
                            Text(MealText.todayLunch(what)).font(.swLabel)
                            Spacer()
                        }
                        .foregroundStyle(p.ink.color)
                        .padding(.horizontal, 14).frame(minHeight: 56).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            if !model.events.isEmpty {
                DayList(entries: model.events, empty: "", members: model.members, zone: .current) { i in
                    if case .birthday = i { onOpen(Target(tab: .kalender, birthdays: true)) } else { onOpen(Target(tab: .kalender, date: today.at(Clock(12, 0)))) }
                }
            }
            if !model.todos.isEmpty {
                TodoList(list: model.todos, members: model.members, onToggle: { o in Task { await model.toggle(o) } }) { _ in onOpen(Target(tab: .todos)) }
            } else if model.loaded && model.events.isEmpty && model.lunch == nil {
                BoxCard { Text("Für dich steht heute nichts an.").font(.swBody).foregroundStyle(p.inkSoft.color).padding(14) }
            }
        }
        .task { await model.load() }
    }
}
