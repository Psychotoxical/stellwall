import SwiftUI

struct ShoppingView: View {
    @Bindable var model: ShoppingModel
    var listId: String? = nil
    @State private var name = ""
    @State private var hints: [Suggestion] = []
    @State private var sheet: SheetKind?
    @Environment(\.palette) private var p

    enum SheetKind: Identifiable {
        case manage, newList, rename, clear, delete, visibility, learned, edit(Item), amount(Pick)
        var id: String {
            switch self {
            case .manage: "manage"
            case .newList: "new"
            case .rename: "rename"
            case .clear: "clear"
            case .delete: "delete"
            case .visibility: "vis"
            case .learned: "learned"
            case let .edit(i): "edit\(i.id)"
            case let .amount(p): "amount\(p.name)"
            }
        }
    }

    /** No amount field beside the search: a pick asks how many, with one tap. */
    private func choose(_ picked: Suggestion? = nil) {
        let n = name, shown = hints
        Task {
            if let pk = await model.pick(n, picked: picked, shown: shown) { sheet = .amount(pk) }
        }
    }

    private func submit() { choose() }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageHead(title: model.list?.name ?? ShopText.title, sub: ShopText.title)
                if model.lists.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(model.lists) { l in
                                Chip(text: l.openCount > 0 ? "\(l.name) \(l.openCount)" : l.name, on: l.id == model.list?.id) { Task { await model.load(l.id) } }
                            }
                        }
                    }
                }
                HStack {
                    if let l = model.list {
                        Button { sheet = .visibility } label: {
                            Text(VisText.see(visibilityLabel(l.visibility, members: model.members, meId: model.me.id))).font(.swSmall)
                                .padding(.horizontal, 12).frame(minHeight: 36)
                                .background(p.field.color, in: Capsule())
                        }.buttonStyle(.plain)
                    }
                    Spacer()
                    Button(ShopText.manage) { sheet = .manage }.font(.swLabel).foregroundStyle(p.ink.color).frame(minHeight: 44)
                }
                Text(ShopText.add).font(.swLabel)
                HStack(spacing: 8) {
                    TextField(ShopText.addPlaceholder, text: $name)
                        .font(.swBody).padding(.horizontal, 14).frame(minHeight: 52)
                        .background(p.surface.color, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(p.rule.color))
                        .submitLabel(.done).onSubmit(submit)
                        .accessibilityLabel(ShopText.add)
                }
                if !hints.isEmpty {
                    BoxCard {
                        ForEach(Array(hints.prefix(5).enumerated()), id: \.offset) { i, s in
                            if i > 0 { RowDivider() }
                            HStack(spacing: 0) {
                                Button { choose(s) } label: {
                                    HStack { Text(s.name).font(.swBody); Spacer(); Text(s.category).font(.swSmall).foregroundStyle(p.inkSoft.color) }
                                        .padding(.horizontal, 14).frame(minHeight: 48).contentShape(Rectangle())
                                }.buttonStyle(.plain)
                                if s.learned == true {
                                    Button { Task { if await model.forget(s) { hints.removeAll { $0 == s } } } } label: {
                                        Text("×").font(.system(size: 24)).foregroundStyle(p.inkSoft.color).frame(width: 48, height: 48)
                                    }
                                    .buttonStyle(.plain).accessibilityLabel(ShopText.forget(s.name))
                                }
                            }
                        }
                    }
                }
                PrimaryButton(ShopText.addButton, enabled: !name.trimmingCharacters(in: .whitespaces).isEmpty, action: submit)
                if let e = model.error { Notice(e) }
                if model.loaded && model.groups.isEmpty && model.checked.isEmpty {
                    BoxCard { Text(ShopText.empty).font(.swBody).foregroundStyle(p.inkSoft.color).padding(16) }
                }
                ForEach(model.groups) { g in
                    SectionHead(title: g.category)
                    BoxCard {
                        ForEach(Array(g.items.enumerated()), id: \.element.id) { i, item in
                            if i > 0 { RowDivider() }
                            ItemRow(item: item, isNew: model.unseen.contains(item.id), meta: item.addedBy == model.me.id ? nil : ShopText.from(model.nameOf(item.addedBy)),
                                    onToggle: { Task { await model.toggle(item) } }, onEdit: { sheet = .edit(item) }, onDelete: { Task { await model.delete(item) } })
                        }
                    }
                }
                if !model.checked.isEmpty {
                    SectionHead(title: ShopText.checked, aside: ShopText.vanish)
                    BoxCard {
                        ForEach(Array(model.checked.enumerated()), id: \.element.id) { i, item in
                            if i > 0 { RowDivider() }
                            ItemRow(item: item, isNew: false, meta: ShopText.checkedBy(model.nameOf(item.checkedBy)), onToggle: { Task { await model.toggle(item) } }, onEdit: { sheet = .edit(item) }, onDelete: { Task { await model.delete(item) } })
                        }
                    }
                }
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(p.ground.color.ignoresSafeArea())
        .refreshable { await model.load(model.list?.id ?? listId) }
        .task(id: listId) { await model.load(listId) }
        .task(id: name) {
            try? await Task.sleep(for: .milliseconds(200))
            hints = await model.suggestions(name)
        }
        .sheet(item: $sheet) { s in sheetView(s).themed(like: p) }
    }

    @ViewBuilder private func sheetView(_ s: SheetKind) -> some View {
        switch s {
        case .manage:
            SheetBody(title: ShopText.manage) {
                GhostButton(ShopText.newList) { sheet = .newList }
                GhostButton(ShopText.renameList) { sheet = .rename }
                GhostButton(ShopText.clearList) { sheet = .clear }
                GhostButton(ShopText.learned) { sheet = .learned }
                if model.list?.createdBy == model.me.id { GhostButton(ShopText.deleteList, danger: true) { sheet = .delete } }
                GhostButton(ShopText.cancel) { sheet = nil }
            }
        case .newList:
            NameSheet(title: ShopText.newList, initial: "") { n in Task { await model.createList(n, visibility: .all) }; sheet = nil }
        case .rename:
            NameSheet(title: ShopText.renameList, initial: model.list?.name ?? "") { n in Task { await model.renameList(n) }; sheet = nil }
        case .clear:
            SheetBody(title: ShopText.clearListConfirm(model.list?.name ?? "")) {
                GhostButton(ShopText.clearList, danger: true) { Haptic.removed(); Task { await model.clearList() }; sheet = nil }
                GhostButton(ShopText.cancel) { sheet = nil }
            }
            .presentationDetents([.medium])
        case .delete:
            SheetBody(title: ShopText.deleteListConfirm(model.list?.name ?? "")) {
                GhostButton(ShopText.deleteList, danger: true) { Haptic.removed(); Task { await model.deleteList() }; sheet = nil }
                GhostButton(ShopText.cancel) { sheet = nil }
            }
            .presentationDetents([.medium])
        case .visibility:
            if let l = model.list {
                VisibilitySheet(lead: l.name, value: l.visibility, members: model.members, meId: model.me.id, readOnly: l.createdBy != model.me.id) { v in Task { await model.setVisibility(v) } }
            }
        case .learned:
            LearnedSheet(model: model)
        case let .amount(pk):
            AmountSheet(pick: pk) { q, c in
                Task {
                    if await model.add(pk, quantity: q, category: c) {
                        Haptic.tap()
                        name = ""
                        hints = []
                        sheet = nil
                    }
                }
            }
            .presentationDetents(pk.known ? [.medium, .large] : [.large])
        case let .edit(item):
            EditItemSheet(item: item) { n, q, c in Task { _ = await model.edit(item, name: n, quantity: q, category: c) } } onDelete: { Task { await model.delete(item) } }
        }
    }
}

struct Chip: View {
    let text: String
    let on: Bool
    let action: () -> Void
    @Environment(\.palette) private var p

    var body: some View {
        Button(action: action) {
            Text(text).font(.swLabel).foregroundStyle(p.ink.color)
                .lineLimit(1).fixedSize()
                .padding(.horizontal, 14).frame(minHeight: 40)
                .background((on ? p.surface : p.field).color, in: RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder((on ? p.primary : p.rule).color, lineWidth: on ? 2 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

private struct ItemRow: View {
    let item: Item
    let isNew: Bool
    let meta: String?
    let onToggle: () -> Void
    let onEdit: () -> Void
    var onDelete: (() -> Void)? = nil
    @Environment(\.palette) private var p

    var body: some View {
        let done = item.checkedAt != nil
        row
            .swipeRow(
                leading: SwipeAction(label: done ? ShopText.untick : ShopText.tick, symbol: done ? "arrow.uturn.backward" : "checkmark", danger: false, action: onToggle),
                trailing: onDelete.map { SwipeAction(label: ShopText.deleteItem, symbol: "trash", danger: true, action: $0) }
            )
            .contextMenu {
                Button(done ? ShopText.untick : ShopText.tick, systemImage: done ? "arrow.uturn.backward" : "checkmark", action: onToggle)
                Button(ShopText.editItem, systemImage: "pencil", action: onEdit)
                if let onDelete { Button(ShopText.deleteItem, systemImage: "trash", role: .destructive, action: onDelete) }
            }
    }

    private var row: some View {
        HStack(spacing: 12) {
            Button(action: onEdit) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(item.name).font(.swLabel).strikethrough(item.checkedAt != nil).foregroundStyle((item.checkedAt != nil ? p.inkSoft : p.ink).color)
                        if isNew {
                            Text(ShopText.new).font(Fonts.body(12, weight: 700, style: .caption2)).foregroundStyle(p.changeInk.color)
                                .padding(.horizontal, 6).padding(.vertical, 2).background(p.change.color, in: RoundedRectangle(cornerRadius: 5))
                        }
                    }
                    if let meta { Text(meta).font(.swSmall).foregroundStyle(p.inkSoft.color) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(item.name) bearbeiten")
            Text(item.quantity).font(.swBody).foregroundStyle(p.inkSoft.color).frame(minWidth: 56, alignment: .trailing)
            Button { Haptic.tap(); onToggle() } label: {
                Image(systemName: item.checkedAt != nil ? "checkmark.square.fill" : "square")
                    .font(.system(size: 26)).foregroundStyle((item.checkedAt != nil ? p.primary : p.ink).color)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.checkedAt != nil ? ShopText.uncheck(item.name) : ShopText.check(item.name))
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
    }
}

/** One tap on a number puts the item on the list; a new name also gets its section here. */
struct AmountSheet: View {
    let pick: Pick
    let onAdd: (String, String) -> Void
    @State private var category: String
    @State private var other = ""
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    init(pick: Pick, onAdd: @escaping (String, String) -> Void) {
        self.pick = pick
        self.onAdd = onAdd
        _category = State(initialValue: pick.category)
    }

    var body: some View {
        SheetBody(title: pick.name) {
            if !pick.known {
                Text(ShopText.sectionFor).font(.swSmall).foregroundStyle(p.inkSoft.color)
                WrapLayout(spacing: 8) {
                    ForEach(CATEGORIES, id: \.self) { c in Chip(text: c, on: c == category) { category = c } }
                }
            }
            Text(ShopText.howMany).font(.swSmall).foregroundStyle(p.inkSoft.color)
            HStack(spacing: 8) {
                ForEach(1...5, id: \.self) { n in
                    Button { onAdd(String(n), category) } label: {
                        Text(String(n)).font(Fonts.body(24, weight: 700, style: .title2)).foregroundStyle(p.ink.color)
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(p.surface.color, in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(p.rule.color, lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                }
            }
            Field(label: ShopText.otherAmount, text: $other, hint: ShopText.otherAmountHint)
            PrimaryButton(ShopText.addButton, enabled: !other.trimmingCharacters(in: .whitespaces).isEmpty) { onAdd(other.trimmingCharacters(in: .whitespaces), category) }
            GhostButton(ShopText.cancel) { dismiss() }
        }
    }
}

/** What the family typed in themselves: move it to its section for good, or forget a misspelling. */
struct LearnedSheet: View {
    let model: ShoppingModel
    @State private var rows: [LearnedEntry]?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    var body: some View {
        SheetBody(title: ShopText.learned) {
            Text(ShopText.learnedLead).font(.swSmall).foregroundStyle(p.inkSoft.color)
            if let rows, rows.isEmpty { Text(ShopText.learnedEmpty).font(.swBody).foregroundStyle(p.inkSoft.color) }
            ForEach(rows ?? [], id: \.name) { r in
                HStack(spacing: 8) {
                    Text(r.name).font(.swBody).frame(maxWidth: .infinity, alignment: .leading)
                    Menu {
                        ForEach(CATEGORIES, id: \.self) { c in
                            Button(c) {
                                rows = rows?.map { $0.name == r.name ? LearnedEntry(name: $0.name, category: c) : $0 }
                                Task { await model.moveLearned(r.name, category: c) }
                            }
                        }
                    } label: {
                        Text(r.category + " ▾").font(.swSmall).foregroundStyle(p.ink.color).padding(.horizontal, 10).frame(minHeight: 44)
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(p.rule.color))
                    }
                    .accessibilityLabel(ShopText.sectionOf(r.name))
                    Button { Task { if await model.forgetLearned(r.name) { rows?.removeAll { $0.name == r.name } } } } label: {
                        Text("×").font(.system(size: 24)).foregroundStyle(p.inkSoft.color).frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain).accessibilityLabel(ShopText.forget(r.name))
                }
            }
            GhostButton(ShopText.learnedDone) { dismiss() }
        }
        .task { rows = await model.learned() }
    }
}

struct NameSheet: View {
    let title: String
    let onSave: (String) -> Void
    @State private var name: String
    @Environment(\.dismiss) private var dismiss

    init(title: String, initial: String, onSave: @escaping (String) -> Void) {
        self.title = title
        self.onSave = onSave
        _name = State(initialValue: initial)
    }

    var body: some View {
        SheetBody(title: title) {
            Field(label: ShopText.listName, text: $name) { if !name.trimmingCharacters(in: .whitespaces).isEmpty { onSave(name) } }
            PrimaryButton(ShopText.save, enabled: !name.trimmingCharacters(in: .whitespaces).isEmpty) { onSave(name) }
            GhostButton(ShopText.cancel) { dismiss() }
        }
    }
}

private struct EditItemSheet: View {
    let item: Item
    let onSave: (String, String, String) -> Void
    let onDelete: () -> Void
    @State private var name: String
    @State private var quantity: String
    @State private var category: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    init(item: Item, onSave: @escaping (String, String, String) -> Void, onDelete: @escaping () -> Void) {
        self.item = item
        self.onSave = onSave
        self.onDelete = onDelete
        _name = State(initialValue: item.name)
        _quantity = State(initialValue: item.quantity)
        _category = State(initialValue: item.category)
    }

    var body: some View {
        SheetBody(title: ShopText.editItem) {
            Field(label: ShopText.name, text: $name)
            Field(label: ShopText.quantity, text: $quantity)
            Text(ShopText.category).font(.swSmall).foregroundStyle(p.inkSoft.color)
            Picker(ShopText.category, selection: $category) { ForEach(CATEGORIES, id: \.self) { Text($0).tag($0) } }
                .pickerStyle(.menu).tint(p.ink.color)
            PrimaryButton(ShopText.save) { onSave(name, quantity, category); dismiss() }
            GhostButton(ShopText.deleteItem, danger: true) { onDelete(); dismiss() }
            GhostButton(ShopText.cancel) { dismiss() }
        }
    }
}
