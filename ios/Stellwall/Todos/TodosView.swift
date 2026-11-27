import SwiftUI

struct TodosView: View {
    @Bindable var model: TodosModel
    @State private var form: TodoFormItem?
    @Environment(\.palette) private var p

    struct TodoFormItem: Identifiable {
        let rule: TodoRule?
        var id: String { rule?.id ?? "new" }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageHead(title: TodoText.title, sub: TodoText.page)
                WrapLayout(spacing: 8) {
                    ForEach(TodoView.allCases, id: \.self) { v in Chip(text: v.label, on: model.view == v) { Task { await model.setView(v) } } }
                }
                WrapLayout(spacing: 8) {
                    Chip(text: TodoText.mine, on: model.mine) { Task { await model.setMine(true) } }
                    Chip(text: TodoText.all, on: !model.mine) { Task { await model.setMine(false) } }
                }
                PrimaryButton(TodoText.new) { form = TodoFormItem(rule: nil) }
                if let e = model.error { Notice(e) }
                if let list = model.list {
                    if list.isEmpty { BoxCard { Text(model.view.empty).font(.swBody).foregroundStyle(p.inkSoft.color).padding(16) } }
                    TodoList(list: list, members: model.members, onToggle: { o in Task { await model.toggle(o) } }) { o in
                        Task { if let r = await model.rule(o.todoId) { form = TodoFormItem(rule: r) } }
                    }
                }
            }
            .padding(16)
        }
        .background(p.ground.color.ignoresSafeArea())
        .task { await model.load() }
        .sheet(item: $form) { f in TodoSheet(model: model, rule: f.rule).environment(\.palette, p) }
    }
}

/** To-dos with their day, who does them and a tick; also used on Start. */
struct TodoList: View {
    let list: [Occurrence]
    let members: [Member]
    let onToggle: (Occurrence) -> Void
    let onOpen: (Occurrence) -> Void
    @Environment(\.palette) private var p

    var body: some View {
        BoxCard {
            ForEach(Array(list.enumerated()), id: \.element.id) { i, o in
                if i > 0 { RowDivider() }
                HStack(spacing: 12) {
                    Button { onOpen(o) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(o.title).font(.swLabel).strikethrough(o.done != nil).foregroundStyle((o.done != nil ? p.inkSoft : p.ink).color)
                            let when = TodoText.whenText(o)
                            if o.overdue && o.done == nil { Text("\(TodoText.overdue) · \(when)").font(.swSmall).foregroundStyle(p.warn.color) }
                            else if !when.isEmpty { Text(when).font(.swSmall).foregroundStyle(p.inkSoft.color) }
                            if let d = o.done, o.needsConfirm { Text(TodoText.doneBy(members.first { $0.id == d.by }?.displayName ?? "?")).font(.swSmall).foregroundStyle(p.inkSoft.color) }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    HStack(spacing: 4) {
                        ForEach(o.assignees, id: \.self) { id in
                            if let m = members.first(where: { $0.id == id }) { PersonChip(name: m.displayName, color: m.color) }
                        }
                    }
                    Button { onToggle(o) } label: {
                        Image(systemName: o.done != nil ? "checkmark.square.fill" : "square").font(.system(size: 26))
                            .foregroundStyle((o.done != nil ? p.primary : p.ink).color).frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(o.done != nil ? TodoText.uncheck(o.title) : TodoText.check(o.title))
                }
                .padding(.horizontal, 14).padding(.vertical, 8)
            }
        }
    }
}

private struct TodoSheet: View {
    let model: TodosModel
    let rule: TodoRule?
    @State private var d: TodoDraft
    @State private var hints: [String] = []
    @State private var who = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    init(model: TodosModel, rule: TodoRule?) {
        self.model = model
        self.rule = rule
        var draft = TodoDraft.of(rule)
        if rule == nil { draft.assignees = [model.me.id] }
        _d = State(initialValue: draft)
    }

    private var isCreator: Bool { rule == nil || rule?.createdBy == model.me.id }

    var body: some View {
        SheetBody(title: rule == nil ? TodoText.new : TodoText.edit) {
            Field(label: TodoText.what, text: $d.title)
            ForEach(hints.prefix(4), id: \.self) { h in
                Button { d.title = h; hints = [] } label: { Text(h).font(.swBody).frame(maxWidth: .infinity, minHeight: 40, alignment: .leading) }.buttonStyle(.plain)
            }
            Text(TodoText.assignees).font(.swSmall).foregroundStyle(p.inkSoft.color)
            ForEach(model.members) { m in
                Toggle(isOn: Binding(get: { d.assignees.contains(m.id) }, set: { on in d.assignees = on ? d.assignees + [m.id] : d.assignees.filter { $0 != m.id } })) {
                    HStack { PersonChip(name: m.displayName, color: m.color); Text(m.displayName).font(.swBody) }
                }
                .frame(minHeight: 44)
            }
            Toggle(TodoText.date, isOn: Binding(get: { d.startDate != nil }, set: { d.startDate = $0 ? Day.today() : nil; if !$0 { d.time = nil } })).font(.swLabel)
            if let start = d.startDate {
                DatePicker(TodoText.date, selection: Binding(get: { start.at(Clock(12, 0)) }, set: { d.startDate = Day($0) }), displayedComponents: .date)
                    .environment(\.locale, Locale(identifier: "de_DE"))
                Toggle(TodoText.time, isOn: Binding(get: { d.time != nil }, set: { d.time = $0 ? Clock(9, 0) : nil })).font(.swLabel)
                if let t = d.time {
                    DatePicker(TodoText.time, selection: Binding(get: { Day(2026, 1, 1).at(t) }, set: { d.time = Clock($0) }), displayedComponents: .hourAndMinute)
                        .environment(\.locale, Locale(identifier: "de_DE"))
                }
            }
            Text(TodoText.repeat).font(.swSmall).foregroundStyle(p.inkSoft.color)
            Picker(TodoText.repeat, selection: $d.repeat) { ForEach(TodoText.repeats, id: \.0) { Text($0.1).tag($0.0) } }.pickerStyle(.menu).tint(p.ink.color)
            if d.repeat == "weekly" {
                WrapLayout(spacing: 8) {
                    ForEach(1...7, id: \.self) { w in
                        Chip(text: TodoText.weekdays[w - 1], on: d.weekdays.contains(w)) { if d.weekdays.contains(w) { d.weekdays.remove(w) } else { d.weekdays.insert(w) } }
                    }
                }
            }
            if d.repeat != "none" {
                Toggle(TodoText.until, isOn: Binding(get: { d.until != nil }, set: { d.until = $0 ? (d.startDate ?? Day.today()).plus(months: 1) : nil })).font(.swLabel)
                if let u = d.until {
                    DatePicker(TodoText.until, selection: Binding(get: { u.at(Clock(12, 0)) }, set: { d.until = Day($0) }), displayedComponents: .date)
                        .environment(\.locale, Locale(identifier: "de_DE"))
                }
            }
            Toggle(isOn: $d.needsConfirm) {
                VStack(alignment: .leading) { Text(TodoText.needsConfirm).font(.swLabel); Text(TodoText.needsConfirmSub).font(.swSmall).foregroundStyle(p.inkSoft.color) }
            }
            if d.startDate != nil {
                Text(TodoText.reminders).font(.swSmall).foregroundStyle(p.inkSoft.color)
                WrapLayout(spacing: 8) {
                    ForEach(TodoText.reminderChips, id: \.0) { m, label in
                        Chip(text: label, on: d.reminders.contains(m)) { d.reminders = d.reminders.contains(m) ? d.reminders.filter { $0 != m } : (d.reminders + [m]).sorted(by: >) }
                    }
                }
            }
            if isCreator {
                GhostButton(VisText.see(visibilityLabel(d.visibility, members: model.members, meId: model.me.id))) { who = true }
            }
            if let error { Notice(error) }
            PrimaryButton(TodoText.save) {
                Task {
                    error = await model.save(rule, d)
                    if error == nil { dismiss() }
                }
            }
            if let rule, isCreator {
                GhostButton(TodoText.delete, danger: true) { Task { await model.delete(rule); dismiss() } }
            }
            GhostButton(TodoText.cancel) { dismiss() }
        }
        .task(id: d.title) {
            guard rule == nil else { return }
            try? await Task.sleep(for: .milliseconds(200))
            hints = await model.suggestions(d.title)
        }
        .sheet(isPresented: $who) {
            VisibilitySheet(lead: d.title, value: d.visibility, members: model.members, meId: model.me.id) { d.visibility = $0 }.environment(\.palette, p)
        }
    }
}
