import SwiftUI

/** The meal area: the week, a recipe while cooking, the pantry. */
struct MealsArea: View {
    let model: MealsModel
    var cook: CookTarget? = nil
    let onOpenList: (String) -> Void
    @State private var page: Page = .week

    enum Page: Equatable { case week, cook(CookTarget), pantry }

    var body: some View {
        Group {
            switch page {
            case .week: MealsView(model: model, onCook: { page = .cook($0) }, onPantry: { page = .pantry }, onOpenList: onOpenList)
            case let .cook(c): RecipeView(api: model.api, target: c, onBack: { page = .week }, onOpenList: onOpenList)
            case .pantry: PantryView(model: PantryModel(api: model.api), onBack: { page = .week })
            }
        }
        .onAppear { if let cook { page = .cook(cook) } }
    }
}

/** A recipe to cook: its slug, the planned servings and the day. */
struct CookTarget: Equatable { let slug: String; let servings: Int; let date: Day }

struct MealsView: View {
    @Bindable var model: MealsModel
    let onCook: (CookTarget) -> Void
    let onPantry: () -> Void
    let onOpenList: (String) -> Void
    @State private var editing: EditDay?
    @State private var shopping: [Day]?
    @Environment(\.palette) private var p

    struct EditDay: Identifiable { let date: Day; var id: String { date.description } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PageHead(title: MealText.title, sub: MealText.page)
                HStack(spacing: 8) {
                    Button { Task { await model.step(-1) } } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.accessibilityLabel(MealText.prev)
                    Chip(text: MealText.thisWeek, on: false) { Task { await model.thisWeek() } }
                    Button { Task { await model.step(1) } } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }.accessibilityLabel(MealText.next)
                    Spacer()
                    Text(model.range).font(.swSmall).foregroundStyle(p.inkSoft.color)
                }
                .foregroundStyle(p.ink.color)
                if let e = model.error { Notice(e) }
                BoxCard {
                    ForEach(Array(model.days.enumerated()), id: \.element) { i, d in
                        if i > 0 { RowDivider() }
                        dayRow(d)
                    }
                }
                PrimaryButton(MealText.shopWeek) { shopping = model.days }
                GhostButton(MealText.staples, action: onPantry)
            }
            .padding(16)
        }
        .background(p.ground.color.ignoresSafeArea())
        .task { await model.load() }
        .sheet(item: $editing) { e in MealSheet(model: model, date: e.date, meal: model.meals[e.date]).environment(\.palette, p) }
        .sheet(isPresented: Binding(get: { shopping != nil }, set: { if !$0 { shopping = nil } })) {
            ShopSheet(api: model.api, dates: shopping ?? [], servings: nil, onOpenList: { id in shopping = nil; onOpenList(id) }).environment(\.palette, p)
        }
    }

    private func dayRow(_ d: Day) -> some View {
        let m = model.meals[d]
        let what = m?.recipe?.name ?? m?.text
        let cook = m?.cookId.flatMap { id in model.members.first { $0.id == id } }
        return HStack(spacing: 12) {
            Button { editing = EditDay(date: d) } label: {
                HStack(spacing: 12) {
                    VStack {
                        Text(Days.weekdayShort(d)).font(.swSmall).foregroundStyle(p.inkSoft.color)
                        Text("\(d.day).").font(Fonts.body(17, weight: d == model.today ? 800 : 600, style: .headline))
                    }
                    .frame(width: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(what ?? MealText.nothing).font(.swLabel).foregroundStyle((what == nil ? p.inkSoft : p.ink).color)
                        if let cook { Text(MealText.cooks(cook.displayName)).font(.swSmall).foregroundStyle(p.inkSoft.color) }
                    }
                    Spacer()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(MealText.dayName(d)), \(MealText.lunch): \(what ?? MealText.nothing)")
            if let r = m?.recipe {
                Button { onCook(CookTarget(slug: r.slug, servings: m?.servings ?? 4, date: d)) } label: { Icons.notebook.image.resizable().frame(width: 26, height: 26).frame(width: 44, height: 44) }
                    .buttonStyle(.plain).foregroundStyle(p.ink.color)
                    .accessibilityLabel("\(MealText.showRecipe): \(r.name)")
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(d == model.today ? p.field.color : .clear)
        // A long press takes the day's meal out without opening the sheet.
        .contextMenu {
            if m != nil {
                Button(role: .destructive) { Task { _ = await model.remove(d) } } label: { Label(MealText.remove, systemImage: "trash") }
            }
        }
    }
}

/** One day's lunch: a tap on a recipe plans it at once; free text needs Save. */
struct MealSheet: View {
    let model: MealsModel
    let date: Day
    let meal: Meal?
    @State private var d: MealDraft
    @State private var q = ""
    @State private var recipes: [RecipeSummary] = []
    @State private var searchError: String?
    @State private var searched = false
    @State private var error: String?
    @State private var servingsTouched = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    init(model: MealsModel, date: Day, meal: Meal?) {
        self.model = model
        self.date = date
        self.meal = meal
        _d = State(initialValue: model.draft(meal))
    }

    var body: some View {
        let showText = d.useText || (searchError != nil && d.recipe == nil)
        SheetBody(title: MealText.plan(MealText.dayName(date))) {
            // At the top: the recipe list below can be long, and this is what people come to change.
            if meal != nil {
                GhostButton(MealText.remove, danger: true) {
                    Task {
                        error = await model.remove(date)
                        if error == nil { dismiss() }
                    }
                }
            }
            HStack(spacing: 8) {
                Chip(text: MealText.recipe, on: !showText) { d.useText = false }
                Chip(text: MealText.freeText, on: showText) { d.useText = true }
            }
            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(MealText.cook).font(.swSmall).foregroundStyle(p.inkSoft.color)
                    Picker(MealText.cook, selection: $d.cookId) {
                        Text(MealText.nobody).tag(String?.none)
                        ForEach(model.members) { Text($0.displayName).tag(String?.some($0.id)) }
                    }
                    .pickerStyle(.menu).tint(p.ink.color)
                }
                Spacer()
                Stepper(value: Binding(get: { d.servings }, set: { d.servings = $0; servingsTouched = true }), in: 1...50) {
                    Text("\(MealText.servings): \(d.servings)").font(.swLabel)
                }
                .frame(maxWidth: 220)
            }
            if let searchError { Notice(searchError) }
            if !showText {
                Field(label: MealText.search, text: $q, submit: .search)
                if searched && recipes.isEmpty && searchError == nil { Text(MealText.searchEmpty).font(.swBody).foregroundStyle(p.inkSoft.color) }
                ForEach(recipes) { r in
                    Button {
                        d.recipe = RecipeRef(id: r.id, slug: r.slug, name: r.name)
                        Task {
                            error = await model.pick(date, d, r, planned: meal, servingsTouched: servingsTouched)
                            if error == nil { dismiss() }
                        }
                    } label: {
                        HStack(spacing: 12) {
                            RecipeImage(api: model.api, id: r.hasImage ? r.id : nil).frame(width: 52, height: 52)
                            Text(r.name).font(.swLabel).foregroundStyle(p.ink.color)
                            Spacer()
                        }
                        .padding(8)
                        .background((d.recipe?.id == r.id ? p.field : p.surface).color, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke((d.recipe?.id == r.id ? p.primary : p.rule).color, lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                }
            } else {
                Field(label: MealText.text, text: $d.text, hint: MealText.textHint)
            }
            if let error { Notice(error) }
            PrimaryButton(MealText.save) {
                var x = d
                x.useText = showText
                Task {
                    error = await model.save(date, x)
                    if error == nil { dismiss() }
                }
            }
            GhostButton(MealText.cancel) { dismiss() }
        }
        .task(id: q) {
            try? await Task.sleep(for: .milliseconds(200))
            let r = await model.search(q)
            recipes = r.recipes
            searchError = r.error
            searched = true
        }
    }
}

/** A recipe picture from Mealie, through the server; a hat when there is none. */
struct RecipeImage: View {
    let api: MealsAPI
    let id: String?
    @State private var image: UIImage?
    @Environment(\.palette) private var p

    var body: some View {
        // The colour gives the size; the picture is laid over it and cut to it, so it never sets the row's size.
        p.field.color
            .overlay {
                if let image { Image(uiImage: image).resizable().scaledToFill() } else { Icons.meals.image.resizable().frame(width: 24, height: 24).foregroundStyle(p.inkSoft.color) }
            }
            .clipShape(RoundedRectangle(cornerRadius: 10))
        .task(id: id) {
            guard let id, let data = try? await api.recipeImage(id) else { return }
            image = UIImage(data: data)
        }
    }
}

/** A recipe while cooking: the screen stays on, ingredients and steps can be ticked off. */
struct RecipeView: View {
    let api: MealsAPI
    let target: CookTarget
    let onBack: () -> Void
    let onOpenList: (String) -> Void
    @State private var recipe: Recipe?
    @State private var error: String?
    @State private var servings: Int
    @State private var ticked: Set<String> = []
    @State private var shop = false
    @Environment(\.palette) private var p

    init(api: MealsAPI, target: CookTarget, onBack: @escaping () -> Void, onOpenList: @escaping (String) -> Void) {
        self.api = api
        self.target = target
        self.onBack = onBack
        self.onOpenList = onOpenList
        _servings = State(initialValue: target.servings)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                BackLink(parent: MealText.page, action: onBack)
                if let e = error { Notice(e) }
                if let r = recipe {
                    PageHead(title: r.name, sub: MealText.dayName(target.date))
                    if r.hasImage { RecipeImage(api: api, id: r.id).frame(height: 200) }
                    Text(MealText.awake).font(.swSmall).foregroundStyle(p.inkSoft.color)
                    Stepper(value: $servings, in: 1...50) { Text("\(MealText.servings): \(servings)").font(.swLabel) }
                    SectionHead(title: MealText.ingredients)
                    BoxCard {
                        ForEach(Array(r.ingredients.enumerated()), id: \.offset) { i, ing in
                            if i > 0 { RowDivider() }
                            tick("i\(i)") {
                                Text(Amounts.line(ing, factor: Double(servings) / Double(max(1, r.servings)))).font(.swLabel).frame(minWidth: 70, alignment: .leading)
                                Text([ing.food, ing.note].filter { !$0.isEmpty }.joined(separator: ", ")).font(.swBody)
                            }
                        }
                    }
                    PrimaryButton(MealText.shopRecipe) { shop = true }
                    SectionHead(title: MealText.steps)
                    BoxCard {
                        ForEach(Array(r.steps.enumerated()), id: \.offset) { i, s in
                            if i > 0 { RowDivider() }
                            tick("s\(i)") {
                                Text("\(i + 1).").font(.swLabel).frame(width: 28, alignment: .leading)
                                Text(s).font(.swBody)
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(p.ground.color.ignoresSafeArea())
        .task {
            do { recipe = try await api.recipe(target.slug) } catch { self.error = MealText.error(error) }
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        .sheet(isPresented: $shop) {
            ShopSheet(api: api, dates: [target.date], servings: servings, onOpenList: { id in shop = false; onOpenList(id) }).environment(\.palette, p)
        }
    }

    private func tick<Content: View>(_ key: String, @ViewBuilder _ content: () -> Content) -> some View {
        let on = ticked.contains(key)
        return Button { if on { ticked.remove(key) } else { ticked.insert(key) } } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundStyle((on ? p.primary : p.inkSoft).color).font(.system(size: 22))
                content()
                Spacer()
            }
            .opacity(on ? 0.55 : 1)
            .foregroundStyle(p.ink.color)
            .padding(12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/** What to buy for the chosen days: needed things ticked, the pantry asked about. */
struct ShopSheet: View {
    let dates: [Day]
    let servings: Int?
    let onOpenList: (String) -> Void
    @State private var model: ShopModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    init(api: MealsAPI, dates: [Day], servings: Int?, onOpenList: @escaping (String) -> Void) {
        self.dates = dates
        self.servings = servings
        self.onOpenList = onOpenList
        _model = State(initialValue: ShopModel(api: api))
    }

    var body: some View {
        SheetBody(title: MealText.shopTitle) {
            if let done = model.done {
                Text(done).font(.swBody)
                if let id = model.doneListId { PrimaryButton(MealText.toList) { onOpenList(id) } }
                GhostButton(MealText.finished) { dismiss() }
            } else {
                if let e = model.error { Notice(e) }
                if let pv = model.preview {
                    if !pv.missing.isEmpty { Notice(MealText.missing(pv.missing.joined(separator: ", "))) }
                    if pv.special.isEmpty && pv.pantry.isEmpty { Text(MealText.nothingToBuy).font(.swBody).foregroundStyle(p.inkSoft.color) }
                    if !pv.special.isEmpty {
                        Text(MealText.special).font(.swLabel)
                        ForEach(pv.special, id: \.self) { l in line(l, ShopModel.key("s:", l)) }
                    }
                    if !pv.pantry.isEmpty {
                        Text(MealText.pantry).font(.swLabel)
                        Text(MealText.pantryHint).font(.swSmall).foregroundStyle(p.inkSoft.color)
                        ForEach(pv.pantry, id: \.self) { l in line(l, ShopModel.key("p:", l)) }
                    }
                    PrimaryButton(MealText.putOn(model.lines.count, pv.listName), enabled: !model.lines.isEmpty && !model.busy) { Task { await model.commit() } }
                }
                GhostButton(MealText.cancel) { dismiss() }
            }
        }
        .task { await model.load(dates, servings: servings) }
    }

    private func line(_ l: ShopLine, _ key: String) -> some View {
        Toggle(isOn: Binding(get: { model.picked.contains(key) }, set: { _ in model.toggle(key) })) {
            HStack { Text(l.food).font(.swBody); Spacer(); Text(l.display.isEmpty ? l.quantity : l.display).font(.swBody).foregroundStyle(p.inkSoft.color) }
        }
        .frame(minHeight: 44)
        .accessibilityLabel("\(l.food) \(l.display)")
    }
}

struct PantryView: View {
    let model: PantryModel
    let onBack: () -> Void
    @State private var name = ""
    @State private var error: String?
    @Environment(\.palette) private var p

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                BackLink(parent: MealText.page, action: onBack)
                PageHead(title: MealText.staples, sub: MealText.page)
                Text(MealText.staplesLead).font(.swBody).foregroundStyle(p.inkSoft.color)
                Field(label: MealText.stapleName, text: $name) { add() }
                PrimaryButton(MealText.stapleAdd, enabled: !name.trimmingCharacters(in: .whitespaces).isEmpty) { add() }
                if let error { Notice(error) }
                if let list = model.list {
                    BoxCard {
                        ForEach(Array(list.enumerated()), id: \.element.id) { i, s in
                            if i > 0 { RowDivider() }
                            HStack {
                                Text(s.name).font(.swBody)
                                Spacer()
                                Button { Task { await model.remove(s) } } label: { Icons.trash.image.resizable().frame(width: 22, height: 22).frame(width: 44, height: 44) }
                                    .buttonStyle(.plain).accessibilityLabel(MealText.stapleRemove(s.name))
                            }
                            .padding(.horizontal, 14)
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(p.ground.color.ignoresSafeArea())
        .task { await model.load() }
    }

    private func add() {
        let n = name
        Task {
            error = await model.add(n)
            if error == nil { name = "" }
        }
    }
}
