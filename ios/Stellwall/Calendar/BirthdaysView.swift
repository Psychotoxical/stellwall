import SwiftUI

struct BirthdaysView: View {
    let model: BirthdaysModel
    let onBack: () -> Void
    @State private var form: BirthdayFormItem?
    @Environment(\.palette) private var p

    struct BirthdayFormItem: Identifiable {
        let birthday: Birthday?
        var id: String { birthday?.id ?? "new" }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                BackLink(parent: CalText.page, action: onBack)
                PageHead(title: CalText.bTitle, sub: CalText.bPage)
                PrimaryButton(CalText.bNew) { form = BirthdayFormItem(birthday: nil) }
                let list = (model.list ?? []).sorted { ($0.month, $0.day) < ($1.month, $1.day) }
                if model.list != nil && list.isEmpty {
                    BoxCard { Text(CalText.bEmpty).font(.swBody).foregroundStyle(p.inkSoft.color).padding(16) }
                }
                if !list.isEmpty {
                    BoxCard {
                        ForEach(Array(list.enumerated()), id: \.element.id) { i, b in
                            if i > 0 { RowDivider() }
                            Button { form = BirthdayFormItem(birthday: b) } label: {
                                HStack(spacing: 12) {
                                    Icons.cake.image.resizable().frame(width: 24, height: 24)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(b.name).font(.swLabel)
                                        Text([CalText.whenText(b.day, b.month), model.turns(b)].compactMap { $0 }.joined(separator: " · ")).font(.swSmall).foregroundStyle(p.inkSoft.color)
                                    }
                                    Spacer()
                                }
                                .foregroundStyle(p.ink.color)
                                .padding(.horizontal, 14).frame(minHeight: 56).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(p.ground.color.ignoresSafeArea())
        .task { await model.load() }
        .sheet(item: $form) { f in BirthdaySheet(model: model, birthday: f.birthday).themed(world: model.me.world, dark: p.ground.luminance < 0.18) }
    }
}

private struct BirthdaySheet: View {
    let model: BirthdaysModel
    let birthday: Birthday?
    @State private var c: BirthdayChange
    @State private var year: String
    @State private var who = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    init(model: BirthdaysModel, birthday: Birthday?) {
        self.model = model
        self.birthday = birthday
        let today = Day.today()
        _c = State(initialValue: BirthdayChange(name: birthday?.name ?? "", day: birthday?.day ?? 1, month: birthday?.month ?? today.month, year: birthday?.year,
                                                remindDays: birthday?.remindDays ?? 1, remindWho: birthday?.remindWho ?? [model.me.id], visibility: birthday?.visibility ?? .all))
        _year = State(initialValue: birthday?.year.map(String.init) ?? "")
    }

    var body: some View {
        SheetBody(title: birthday == nil ? CalText.bNew : CalText.bEdit) {
            Field(label: CalText.bName, text: $c.name)
            HStack {
                Picker(CalText.bDay, selection: $c.day) { ForEach(1...31, id: \.self) { Text("\($0)").tag($0) } }.pickerStyle(.menu)
                Picker(CalText.bMonth, selection: $c.month) { ForEach(1...12, id: \.self) { Text(CalText.months[$0 - 1]).tag($0) } }.pickerStyle(.menu)
                Spacer()
            }
            .tint(p.ink.color)
            Field(label: CalText.bYear, text: $year, keyboard: .numberPad, hint: CalText.bYearHint)
            if birthday == nil || birthday?.createdBy == model.me.id {
                GhostButton(VisText.see(visibilityLabel(c.visibility ?? .all, members: model.members, meId: model.me.id))) { who = true }
            }
            Text(CalText.bRemind).font(.swSmall).foregroundStyle(p.inkSoft.color)
            Picker(CalText.bRemind, selection: $c.remindDays) { ForEach(CalText.remindDays, id: \.0) { Text($0.1).tag($0.0) } }.pickerStyle(.menu).tint(p.ink.color)
            Text(CalText.bRemindWho).font(.swSmall).foregroundStyle(p.inkSoft.color)
            ForEach(model.members) { m in
                Toggle(isOn: Binding(get: { c.remindWho.contains(m.id) }, set: { on in c.remindWho = on ? c.remindWho + [m.id] : c.remindWho.filter { $0 != m.id } })) {
                    HStack { PersonChip(name: m.displayName, color: m.color); Text(m.displayName).font(.swBody) }
                }
                .frame(minHeight: 44)
            }
            if let error { Notice(error) }
            PrimaryButton(CalText.save) {
                var body = c
                body.year = Int(year.filter(\.isNumber))
                Task {
                    error = await model.save(birthday, body)
                    if error == nil { dismiss() }
                }
            }
            if let b = birthday, b.createdBy == model.me.id {
                GhostButton(CalText.bDelete, danger: true) { Task { await model.delete(b); dismiss() } }
            }
            GhostButton(CalText.cancel) { dismiss() }
        }
        .sheet(isPresented: $who) {
            VisibilitySheet(lead: c.name, value: c.visibility ?? .all, members: model.members, meId: model.me.id) { c.visibility = $0 }
        }
    }
}
