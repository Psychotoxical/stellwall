import SwiftUI

/** The meal area: the week, a recipe while cooking, the pantry. */
struct MealsArea: View {
    let model: MealsModel
    var cook: CookTarget? = nil
    let onOpenList: (String) -> Void
    @State private var page: Page = .week

    enum Page: Equatable { case week, cook(CookTarget), pantry, recipes }

    var body: some View {
        Group {
            switch page {
            case .week: MealsView(model: model, onCook: { page = .cook($0) }, onPantry: { page = .pantry }, onOpenList: onOpenList, onRecipes: { page = .recipes })
            case let .cook(c): RecipeView(api: model.api, target: c, onBack: { page = c.date == nil ? .recipes : .week }, onOpenList: onOpenList).backSwipe { page = c.date == nil ? .recipes : .week }
            case .recipes: RecipesView(api: model.api, onOpen: { page = .cook(CookTarget(slug: $0, servings: nil, date: nil)) }, onMade: { page = .cook(CookTarget(slug: $0, servings: nil, date: nil, sortNow: true)) }, onBack: { page = .week }).backSwipe { page = .week }
            case .pantry: PantryView(model: PantryModel(api: model.api), onBack: { page = .week }).backSwipe { page = .week }
            }
        }
        .onAppear { if let cook { page = .cook(cook) } }
    }
}

/** A recipe to cook: its slug, the planned servings and the day. */
/** No date: opened from the recipe book, servings from the recipe. */
/** sortNow: a recipe just made, its categories are asked for at once. */
struct CookTarget: Equatable { let slug: String; let servings: Int?; let date: Day?; var sortNow = false }

struct MealsView: View {
    @Bindable var model: MealsModel
    let onCook: (CookTarget) -> Void
    let onPantry: () -> Void
    let onOpenList: (String) -> Void
    var onRecipes: () -> Void = {}
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
                GhostButton(MealText.recipes, action: onRecipes)
                GhostButton(MealText.staples, action: onPantry)
            }
            .padding(16)
        }
        .background(p.ground.color.ignoresSafeArea())
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await model.load() }
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
        .background(d == model.today ? p.field.color : p.surface.color)
        .swipeRow(trailing: m == nil ? nil : SwipeAction(label: MealText.remove, symbol: "trash", danger: true) { Task { _ = await model.remove(d) } })
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
            WrapLayout(spacing: 8) {
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
        } footer: {
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
    @State private var servings: Int?
    @State private var ticked: Set<String> = []
    @State private var shop = false
    @State private var planning = false
    @State private var planned: String?
    @State private var sorting = false
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
                    PageHead(title: r.name, sub: target.date.map(MealText.dayName) ?? MealText.recipes)
                    if r.hasImage { RecipeImage(api: api, id: r.id).frame(height: 200) }
                    Text(MealText.awake).font(.swSmall).foregroundStyle(p.inkSoft.color)
                    // Without servings in Mealie (a baking sheet) the amounts stay as written.
                    if r.servingsKnown == false {
                        Text(MealText.asWritten).font(.swLabel).foregroundStyle(p.inkSoft.color)
                    } else {
                        Stepper(value: Binding(get: { n(r) }, set: { servings = $0 }), in: 1...50) { Text("\(MealText.servings): \(n(r))").font(.swLabel) }
                    }
                    GhostButton(MealText.planRecipe) { planning = true }
                    GhostButton(MealText.categories) { sorting = true }
                    if let c = r.categories, !c.isEmpty { Text(c.map(\.name).joined(separator: ", ")).font(.swSmall).foregroundStyle(p.inkSoft.color) }
                    if let planned { Text(planned).font(.swBody) }
                    SectionHead(title: MealText.ingredients)
                    BoxCard {
                        ForEach(Array(r.ingredients.enumerated()), id: \.offset) { i, ing in
                            if i > 0 { RowDivider() }
                            tick("i\(i)") {
                                Text(Amounts.line(ing, factor: Double(n(r)) / Double(max(1, r.servings)))).font(.swLabel).frame(minWidth: 70, alignment: .leading)
                                Text(MealText.foodLine(ing)).font(.swBody)
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
                                Text(MealText.step(s)).font(.swBody)
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(p.ground.color.ignoresSafeArea())
        .task {
            do {
                recipe = try await api.recipe(target.slug)
                if target.sortNow { sorting = true }
            } catch { self.error = MealText.error(error) }
        }
        .sheet(isPresented: $sorting) {
            if let r = recipe {
                CategorySheet(api: api, recipe: r) { recipe = $0; sorting = false }.environment(\.palette, p)
            }
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        .sheet(isPresented: $shop) {
            if let r = recipe {
                if let date = target.date {
                    ShopSheet(api: api, dates: [date], servings: n(r), onOpenList: { id in shop = false; onOpenList(id) }).environment(\.palette, p)
                } else {
                    ShopSheet(api: api, dates: [], servings: nil, recipe: (r.slug, n(r)), onOpenList: { id in shop = false; onOpenList(id) }).environment(\.palette, p)
                }
            }
        }
        .sheet(isPresented: $planning) {
            PlanSheet { day in
                guard let r = recipe else { return }
                do {
                    try await api.saveMeal(date: day.description, recipe: RecipeRef(id: r.id, slug: r.slug, name: r.name), text: nil, cookId: nil, servings: n(r))
                    planning = false
                    planned = MealText.planned(MealText.dayName(day))
                    Haptic.done()
                } catch {
                    self.error = MealText.error(error)
                }
            }
            .environment(\.palette, p)
            .presentationDetents([.medium, .large])
        }
    }

    /** The servings shown: chosen, planned, or the recipe's own; as written for a baking sheet. */
    private func n(_ r: Recipe) -> Int { r.servingsKnown == false ? r.servings : servings ?? r.servings }

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

    var recipe: (slug: String, servings: Int)? = nil

    init(api: MealsAPI, dates: [Day], servings: Int?, recipe: (slug: String, servings: Int)? = nil, onOpenList: @escaping (String) -> Void) {
        self.dates = dates
        self.servings = servings
        self.recipe = recipe
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
                }
            }
        } footer: {
            if model.done == nil {
                if let pv = model.preview {
                    PrimaryButton(MealText.putOn(model.lines.count, pv.listName), enabled: !model.lines.isEmpty && !model.busy) { Task { await model.commit() } }
                }
                GhostButton(MealText.cancel) { dismiss() }
            }
        }
        .task { await model.load(dates, servings: servings, recipe: recipe) }
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


/** Which day the recipe goes on: the next 14 days to tap. */
struct PlanSheet: View {
    let onPlan: (Day) async -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    var body: some View {
        SheetBody(title: MealText.planFor) {
            ForEach(0..<14, id: \.self) { k in
                let d = Day.today().plus(days: k)
                Button { Task { await onPlan(d) } } label: {
                    Text(MealText.dayName(d)).font(.swBody).foregroundStyle(p.ink.color)
                        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading).padding(.horizontal, 14)
                        .background(p.field.color, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
            }
            GhostButton(MealText.cancel) { dismiss() }
        }
    }
}

/** Every recipe in Mealie, to look at, cook or shop for without planning it for a day. */
struct RecipesView: View {
    let api: MealsAPI
    let onOpen: (String) -> Void
    var onMade: ((String) -> Void)? = nil
    let onBack: () -> Void
    @State private var q = ""
    @State private var list: [RecipeSummary]?
    @State private var picked: [String] = []
    @State private var error: String?
    @State private var adding = false
    @Environment(\.palette) private var p

    /** [list]: what to show before the first answer (pictures in tests). */
    init(api: MealsAPI, list: [RecipeSummary]? = nil, onOpen: @escaping (String) -> Void, onMade: ((String) -> Void)? = nil, onBack: @escaping () -> Void) {
        self.api = api
        self.onOpen = onOpen
        self.onMade = onMade
        self.onBack = onBack
        _list = State(initialValue: list)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                BackLink(parent: MealText.page, action: onBack)
                PageHead(title: MealText.recipes, sub: MealText.page)
                PrimaryButton(MealText.addRecipe) { adding = true }
                Field(label: MealText.search, text: $q, submit: .search)
                if let list {
                    let chips = CategoryFilter.chips(list)
                    if !chips.isEmpty || !picked.isEmpty {
                        WrapLayout(spacing: 8) {
                            ForEach(chips, id: \.slug) { c in Chip(text: c.name, on: picked.contains(c.slug)) { picked = CategoryFilter.flip(picked, c.slug) } }
                            if list.contains(where: { $0.categories?.isEmpty ?? true }) {
                                Chip(text: MealText.noCategory, on: picked.contains(CategoryFilter.without)) { picked = CategoryFilter.flip(picked, CategoryFilter.without) }
                            }
                        }
                        .accessibilityElement(children: .contain)
                        .accessibilityLabel(MealText.categoryFilter)
                    }
                }
                if let error { Notice(error) }
                if let list, list.isEmpty { Text(q.isEmpty ? MealText.noRecipes : MealText.searchEmpty).font(.swBody).foregroundStyle(p.inkSoft.color) }
                if let all = list, !all.isEmpty, CategoryFilter.shown(all, picked).isEmpty { Text(MealText.categoryEmpty).font(.swBody).foregroundStyle(p.inkSoft.color) }
                if let all = list, !CategoryFilter.shown(all, picked).isEmpty {
                    let list = CategoryFilter.shown(all, picked)
                    BoxCard {
                        ForEach(Array(list.enumerated()), id: \.element.id) { i, r in
                            if i > 0 { RowDivider() }
                            Button { onOpen(r.slug) } label: {
                                HStack(spacing: 12) {
                                    RecipeImage(api: api, id: r.hasImage ? r.id : nil).frame(width: 52, height: 52)
                                    Text(r.name).font(.swLabel).foregroundStyle(p.ink.color)
                                    Spacer()
                                }
                                .padding(8).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(p.ground.color.ignoresSafeArea())
        .task(id: q) {
            try? await Task.sleep(for: .milliseconds(200))
            do { list = try await api.recipes(q.trimmingCharacters(in: .whitespaces)); error = nil } catch { self.error = MealText.error(error) }
        }
        .sheet(isPresented: $adding) {
            AddRecipeSheet(api: api) { made in adding = false; (onMade ?? onOpen)(made.slug) }.environment(\.palette, p)
        }
    }
}

/** A new recipe in Mealie: from photographed pages (Mealie's AI reads them), a link, or typed in. */
struct AddRecipeSheet: View {
    let api: MealsAPI
    let onMade: (RecipeSummary) -> Void
    @State private var way = "photo"
    @State private var pages: [Data] = []
    @State private var url = ""
    @State private var text = ""
    @State private var scanning = false
    @State private var busy = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    private var ready: Bool {
        switch way {
        case "photo": !pages.isEmpty
        case "link": url.trimmingCharacters(in: .whitespaces).range(of: "^https?://\\S+$", options: .regularExpression) != nil
        default: !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    var body: some View {
        SheetBody(title: MealText.addRecipe) {
            WrapLayout(spacing: 8) {
                ForEach(MealText.ways, id: \.0) { key, label in Chip(text: label, on: way == key) { way = key } }
            }
            if way == "photo" {
                GhostButton(MealText.scan) { scanning = true }
                if !pages.isEmpty { Text(MealText.pages(pages.count)).font(.swBody) }
                Text(MealText.photosHint).font(.swSmall).foregroundStyle(p.inkSoft.color)
            } else if way == "link" {
                Field(label: MealText.link, text: $url, keyboard: .URL, capitalization: .never, autocorrect: false)
            } else {
                Text(MealText.recipeText).font(.swSmall).foregroundStyle(p.inkSoft.color)
                TextEditor(text: $text).font(.swBody).frame(minHeight: 160).padding(8)
                    .scrollContentBackground(.hidden).background(p.surface.color, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(p.rule.color))
                    .accessibilityLabel(MealText.recipeText)
                Text(MealText.recipeTextHint).font(.swSmall).foregroundStyle(p.inkSoft.color)
            }
            if busy { Text(MealText.importing).font(.swBody).foregroundStyle(p.inkSoft.color) }
            if let error { Notice(error) }
            PrimaryButton(MealText.importButton, enabled: ready && !busy) {
                busy = true
                error = nil
                Task {
                    do {
                        let made = try await api.importRecipe(
                            url: way == "link" ? url.trimmingCharacters(in: .whitespaces) : nil,
                            text: way == "text" ? text.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
                            images: way == "photo" ? pages : [])
                        Haptic.done()
                        onMade(made)
                    } catch {
                        self.error = MealText.error(error)
                    }
                    busy = false
                }
            }
            GhostButton(MealText.cancel) { dismiss() }
        }
        .fullScreenCover(isPresented: $scanning) {
            RecipeScanner { scanned in
                scanning = false
                if let scanned { pages = scanned }
            }
            .ignoresSafeArea()
        }
    }
}

/** The recipe's categories in Mealie: every category as a chip, the current ones on. */
struct CategorySheet: View {
    let api: MealsAPI
    let recipe: Recipe
    let onSaved: (Recipe) -> Void
    @State private var all: [RecipeCategory]?
    @State private var on: Set<String>
    @State private var busy = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    /** [preset]: the categories to show before Mealie answers (pictures in tests). */
    init(api: MealsAPI, recipe: Recipe, preset: [RecipeCategory]? = nil, onSaved: @escaping (Recipe) -> Void) {
        self.api = api
        self.recipe = recipe
        self.onSaved = onSaved
        _all = State(initialValue: preset)
        _on = State(initialValue: Set((recipe.categories ?? []).map(\.id)))
    }

    var body: some View {
        SheetBody(title: MealText.categories) {
            Text(MealText.categoriesHint).font(.swSmall).foregroundStyle(p.inkSoft.color)
            if let all, all.isEmpty { Text(MealText.categoriesNone).font(.swBody).foregroundStyle(p.inkSoft.color) }
            if let all {
                WrapLayout(spacing: 8) {
                    ForEach(all) { c in Chip(text: c.name, on: on.contains(c.id)) { if on.contains(c.id) { on.remove(c.id) } else { on.insert(c.id) } } }
                }
            }
            if let error { Notice(error) }
        } footer: {
            PrimaryButton(MealText.save, enabled: all != nil && !busy) {
                busy = true
                Task {
                    do {
                        // In the order Mealie lists them, so the request is the same each time.
                        let ids = (all ?? []).map(\.id).filter { on.contains($0) }
                        onSaved(try await api.setCategories(slug: recipe.slug, ids: ids))
                        Haptic.done()
                    } catch {
                        self.error = MealText.error(error)
                    }
                    busy = false
                }
            }
            GhostButton(MealText.cancel) { dismiss() }
        }
        .task {
            guard all == nil else { return }
            do { all = try await api.categories() } catch { self.error = MealText.error(error) }
        }
    }
}
