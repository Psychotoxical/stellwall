import SwiftUI

struct CalendarView: View {
    @Bindable var model: CalendarModel
    let birthdays: BirthdaysModel
    var startDate: Day? = nil
    var openBirthdays = false
    @State private var form: EventForm?
    @State private var showBirthdays = false
    @Environment(\.palette) private var p

    var body: some View {
        Group {
            if showBirthdays {
                BirthdaysView(model: birthdays) { showBirthdays = false }
            } else {
                page
            }
        }
        .task {
            if let startDate { await model.select(startDate) }
            if openBirthdays { showBirthdays = true }
            await model.load()
        }
        .sheet(item: $form) { f in
            EventSheet(model: model, form: f).themed(world: model.me.world, dark: p.ground.luminance < 0.18)
        }
    }

    private var page: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageHead(title: model.title, sub: CalText.page)
                HStack(spacing: 8) {
                    ForEach(CalView.allCases, id: \.self) { v in Chip(text: v.rawValue, on: model.view == v) { Task { await model.setView(v) } } }
                    Spacer()
                    Chip(text: model.mine ? CalText.mine : CalText.all, on: model.mine) { Task { await model.setMine(!model.mine) } }
                }
                if model.view != .upcoming {
                    HStack(spacing: 8) {
                        Button { Task { await model.step(-1) } } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.accessibilityLabel(CalText.prev)
                        Chip(text: CalText.today, on: false) { Task { await model.goToday() } }
                        Button { Task { await model.step(1) } } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }.accessibilityLabel(CalText.next)
                        Spacer()
                    }
                    .foregroundStyle(p.ink.color)
                }
                HStack(spacing: 8) {
                    PrimaryButton(CalText.new) { form = model.newForm(model.view == .upcoming ? model.today : model.sel) }
                    GhostButton(CalText.birthdays) { showBirthdays = true }
                }
                if let e = model.error { Notice(e) }
                switch model.view {
                case .month:
                    MonthGrid(model: model)
                    SectionHead(title: Days.dayLabel(model.sel))
                    DayList(entries: model.days[model.sel] ?? [], empty: CalText.dayEmpty, members: model.members, zone: model.zone, open: open)
                case .week:
                    let (from, _) = model.range
                    let week = (0..<7).map { from.plus(days: $0) }
                    if week.allSatisfy({ (model.days[$0] ?? []).isEmpty }) {
                        BoxCard { Text(CalText.weekEmpty).font(.swBody).foregroundStyle(p.inkSoft.color).padding(16) }
                    }
                    ForEach(week.filter { !(model.days[$0] ?? []).isEmpty }, id: \.self) { d in
                        SectionHead(title: Days.dayLabel(d))
                        DayList(entries: model.days[d] ?? [], empty: "", members: model.members, zone: model.zone, open: open)
                    }
                case .upcoming:
                    let list = model.days.keys.sorted().filter { $0 >= model.today }
                    if list.isEmpty { BoxCard { Text(CalText.upcomingEmpty).font(.swBody).foregroundStyle(p.inkSoft.color).padding(16) } }
                    ForEach(list, id: \.self) { d in
                        SectionHead(title: Days.dayLabel(d))
                        DayList(entries: model.days[d] ?? [], empty: "", members: model.members, zone: model.zone, open: open)
                    }
                }
            }
            .padding(16)
        }
        .background(p.ground.color.ignoresSafeArea())
    }

    private func open(_ i: CalendarInstance) {
        switch i {
        case let .event(e): Task { if let f = await model.open(e) { form = f } }
        case .birthday: showBirthdays = true
        }
    }
}

private struct MonthGrid: View {
    let model: CalendarModel
    @Environment(\.palette) private var p

    var body: some View {
        let (from, _) = model.range
        let cols = Array(repeating: GridItem(.flexible(), spacing: 2), count: 7)
        VStack(spacing: 4) {
            HStack(spacing: 2) { ForEach(CalText.weekdays, id: \.self) { Text($0).font(.swSmall).foregroundStyle(p.inkSoft.color).frame(maxWidth: .infinity) } }
            LazyVGrid(columns: cols, spacing: 2) {
                ForEach(0..<42, id: \.self) { i in
                    let d = from.plus(days: i)
                    let entries = model.days[d] ?? []
                    let inMonth = d.month == model.sel.month
                    Button { Task { await model.select(d) } } label: {
                        VStack(spacing: 3) {
                            Text("\(d.day)").font(Fonts.body(15, weight: d == model.today ? 800 : 500, style: .callout))
                                .foregroundStyle((d == model.sel ? p.primaryInk : inMonth ? p.ink : p.inkSoft).color)
                                .frame(width: 30, height: 30)
                                .background(d == model.sel ? p.primary.color : .clear, in: Circle())
                                .overlay(Circle().stroke(d == model.today && d != model.sel ? p.primary.color : .clear, lineWidth: 1.5))
                            HStack(spacing: 2) {
                                ForEach(0..<min(entries.count, 3), id: \.self) { _ in Circle().fill(p.accent.color).frame(width: 5, height: 5) }
                            }
                            .frame(height: 6)
                        }
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(Days.dayLabel(d)), \(entries.count) Einträge")
                }
            }
        }
        .padding(8)
        .background(p.surface.color, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(p.rule.color))
    }
}

/** The entries of one day: time, title, place and the people it is for. */
struct DayList: View {
    let entries: [CalendarInstance]
    let empty: String
    let members: [Member]
    let zone: TimeZone
    let open: (CalendarInstance) -> Void
    @Environment(\.palette) private var p

    var body: some View {
        BoxCard {
            if entries.isEmpty && !empty.isEmpty {
                Text(empty).font(.swBody).foregroundStyle(p.inkSoft.color).padding(16)
            }
            ForEach(Array(entries.enumerated()), id: \.element.id) { i, e in
                if i > 0 { RowDivider() }
                Button { open(e) } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Group {
                            if case .birthday = e { Icons.cake.image.resizable().frame(width: 24, height: 24) } else {
                                Text(e.allDay ? CalText.allDayShort : Days.hhmm(e.start, zone: zone)).font(.swLabel)
                            }
                        }
                        .frame(width: 70, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(e.title).font(.swLabel)
                            if case let .birthday(b) = e, let age = b.age { Text(CalText.turns(age)).font(.swSmall).foregroundStyle(p.inkSoft.color) }
                            if case let .event(ev) = e, !ev.location.isEmpty { Text(ev.location).font(.swSmall).foregroundStyle(p.inkSoft.color) }
                        }
                        Spacer()
                        if case let .event(ev) = e {
                            HStack(spacing: 4) {
                                ForEach(ev.forWhom, id: \.self) { id in
                                    if let m = members.first(where: { $0.id == id }) { PersonChip(name: m.displayName, color: m.color) }
                                }
                            }
                        }
                    }
                    .foregroundStyle(p.ink.color)
                    .padding(.horizontal, 14).padding(.vertical, 12)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/** A new event or a change; for a series the person picks which occurrences it is for. */
struct EventSheet: View {
    let model: CalendarModel
    let form: EventForm
    @State private var d: EventDraft
    @State private var error: String?
    @State private var ask: Ask?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    init(model: CalendarModel, form: EventForm) {
        self.model = model
        self.form = form
        _d = State(initialValue: form.start0)
    }

    private func finish(_ e: String?) {
        error = e
        if e == nil { dismiss() }
    }

    var body: some View {
        SheetBody(title: form.event == nil ? CalText.new : CalText.edit) {
            Field(label: CalText.title, text: $d.title)
            Toggle(CalText.allDay, isOn: $d.allDay).font(.swLabel).frame(minHeight: 44)
            dateRow(CalText.from, day: $d.startDate, time: $d.startTime)
            dateRow(CalText.to, day: $d.endDate, time: $d.endTime)
            Field(label: CalText.location, text: $d.location)
            Field(label: CalText.notes, text: $d.notes)
            Text(CalText.forWhom).font(.swSmall).foregroundStyle(p.inkSoft.color)
            ForEach(model.members) { m in
                Toggle(isOn: Binding(get: { d.forWhom.contains(m.id) }, set: { on in d.forWhom = on ? d.forWhom + [m.id] : d.forWhom.filter { $0 != m.id } })) {
                    HStack { PersonChip(name: m.displayName, color: m.color); Text(m.displayName).font(.swBody) }
                }
                .frame(minHeight: 44)
            }
            if form.isCreator {
                Toggle(isOn: $d.seeAll) {
                    VStack(alignment: .leading) { Text(CalText.seeAll).font(.swLabel); Text(CalText.seeAllSub).font(.swSmall).foregroundStyle(p.inkSoft.color) }
                }
            }
            Text(CalText.repeat).font(.swSmall).foregroundStyle(p.inkSoft.color)
            Picker(CalText.repeat, selection: $d.repeat) {
                ForEach(Repeat.allCases.filter { $0 != .custom || d.repeat == .custom }, id: \.self) { r in
                    Text(r == .custom ? (form.event?.rrule.map(Rules.describe) ?? "") : r.rawValue).tag(r)
                }
            }
            .pickerStyle(.menu).tint(p.ink.color)
            Text(CalText.reminders).font(.swSmall).foregroundStyle(p.inkSoft.color)
            HStack(spacing: 8) {
                ForEach(CalText.reminderChips, id: \.0) { m, label in
                    Chip(text: label, on: d.reminders.contains(m)) { d.reminders = d.reminders.contains(m) ? d.reminders.filter { $0 != m } : (d.reminders + [m]).sorted(by: >) }
                }
            }
            if let error { Notice(error) }
            PrimaryButton(CalText.save) {
                if form.isSeries { ask = .save } else { Task { finish(await model.save(form, d, scope: nil)) } }
            }
            if form.event != nil {
                GhostButton(CalText.delete, danger: true) {
                    if form.isSeries { ask = .delete } else { Task { finish(await model.delete(form, scope: .all)) } }
                }
            }
            GhostButton(CalText.cancel) { dismiss() }
        }
        .confirmationDialog(ask == .delete ? CalText.scopeDelete : CalText.scopeSave, isPresented: Binding(get: { ask != nil }, set: { if !$0 { ask = nil } }), titleVisibility: .visible) {
            let which = ask ?? .save
            ForEach(EventForms.scopes(which, isCreator: form.isCreator, seriesOnly: EventForms.seriesOnly(form.start0, d)), id: \.self) { s in
                Button(s.label, role: which == .delete ? .destructive : nil) {
                    Task { finish(which == .delete ? await model.delete(form, scope: s) : await model.save(form, d, scope: s)) }
                }
            }
            Button(CalText.cancel, role: .cancel) {}
        }
    }

    private func dateRow(_ label: String, day: Binding<Day>, time: Binding<Clock>) -> some View {
        let zone = model.zone
        return HStack {
            Text(label).font(.swLabel).frame(width: 44, alignment: .leading)
            DatePicker(label, selection: Binding(get: { day.wrappedValue.at(Clock(12, 0), zone: zone) }, set: { day.wrappedValue = Day($0, zone: zone) }), displayedComponents: .date)
                .labelsHidden().environment(\.locale, Locale(identifier: "de_DE"))
            if !d.allDay {
                DatePicker(label, selection: Binding(get: { Day(2026, 1, 1).at(time.wrappedValue, zone: zone) }, set: { time.wrappedValue = Clock($0, zone: zone) }), displayedComponents: .hourAndMinute)
                    .labelsHidden().environment(\.locale, Locale(identifier: "de_DE"))
            }
            Spacer()
        }
    }
}
