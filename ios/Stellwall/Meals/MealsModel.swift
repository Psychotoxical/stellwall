import Foundation
import Observation

struct RecipeRef: Codable, Equatable, Hashable { let id: String; let slug: String; let name: String }
struct RecipeSummary: Codable, Equatable, Identifiable { let id: String; let slug: String; let name: String; let servings: Int; let hasImage: Bool }
struct Ingredient: Codable, Equatable, Hashable { let quantity: Double?; let unit: String?; let food: String; let note: String }
struct Recipe: Codable, Equatable { let id: String; let slug: String; let name: String; let servings: Int; let hasImage: Bool; let ingredients: [Ingredient]; let steps: [String] }

/** Lunch on one day: a recipe from Mealie or a free text. */
struct Meal: Codable, Equatable { let date: String; let recipe: RecipeRef?; let text: String?; let cookId: String?; let servings: Int; let updatedBy: String }

struct ShopLine: Codable, Equatable, Hashable {
    let food: String
    let quantity: String
    var display: String = ""

    init(food: String, quantity: String, display: String = "") {
        self.food = food
        self.quantity = quantity
        self.display = display
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        food = try c.decode(String.self, forKey: .food)
        quantity = try c.decode(String.self, forKey: .quantity)
        display = (try? c.decode(String.self, forKey: .display)) ?? ""
    }
}

struct ShopPreview: Codable, Equatable { let listId: String; let listName: String; let special: [ShopLine]; let pantry: [ShopLine]; let missing: [String] }
struct CommitResult: Codable, Equatable { let added: Int; let listId: String; let listName: String }
struct Staple: Codable, Equatable, Identifiable { let id: String; let name: String; let variants: [String] }

protocol MealsAPI {
    func members() async throws -> [Member]
    func meals(week: String) async throws -> [Meal]
    func saveMeal(date: String, recipe: RecipeRef?, text: String?, cookId: String?, servings: Int) async throws
    func deleteMeal(date: String) async throws
    func recipes(_ q: String) async throws -> [RecipeSummary]
    func recipe(_ slug: String) async throws -> Recipe
    func recipeImage(_ id: String) async throws -> Data
    func shopPreview(dates: [String], servings: Int?) async throws -> ShopPreview
    func shopCommit(_ lines: [ShopLine]) async throws -> CommitResult
    func pantry() async throws -> [Staple]
    func addStaple(_ name: String) async throws
    func deleteStaple(_ id: String) async throws
}

extension APIClient: MealsAPI {
    func meals(week: String) async throws -> [Meal] { try await json([Meal].self, "GET", "api/meals", query: [("week", week)]) }

    /** Both keys must be there, one of them null. */
    func saveMeal(date: String, recipe: RecipeRef?, text: String?, cookId: String?, servings: Int) async throws {
        let r: Any = orNull(recipe.map { ["id": $0.id, "slug": $0.slug, "name": $0.name] })
        let body: [String: Any] = ["recipe": r, "text": orNull(text), "cookId": orNull(cookId), "servings": servings]
        try await send("PUT", "api/meals/\(date)", body: try JSONSerialization.data(withJSONObject: body))
    }

    func deleteMeal(date: String) async throws { try await send("DELETE", "api/meals/\(date)") }
    func recipes(_ q: String) async throws -> [RecipeSummary] { try await json([RecipeSummary].self, "GET", "api/recipes", query: [("q", q)]) }
    func recipe(_ slug: String) async throws -> Recipe { try await json(Recipe.self, "GET", "api/recipes/\(slug)") }
    func recipeImage(_ id: String) async throws -> Data { try await send("GET", "api/recipes/\(id)/image") }

    func shopPreview(dates: [String], servings: Int?) async throws -> ShopPreview {
        var b: [String: Any] = ["dates": dates]
        if let servings { b["servings"] = servings }
        return try APIClient.decoder.decode(ShopPreview.self, from: try await send("POST", "api/meals/shopping/preview", body: try JSONSerialization.data(withJSONObject: b)))
    }

    func shopCommit(_ lines: [ShopLine]) async throws -> CommitResult {
        let b = ["lines": lines.map { ["food": $0.food, "quantity": $0.quantity] }]
        return try APIClient.decoder.decode(CommitResult.self, from: try await send("POST", "api/meals/shopping/commit", body: try JSONSerialization.data(withJSONObject: b)))
    }

    func pantry() async throws -> [Staple] { try await json([Staple].self, "GET", "api/pantry") }
    func addStaple(_ name: String) async throws { try await send("POST", "api/pantry", body: try APIClient.encoder.encode(["name": name])) }
    func deleteStaple(_ id: String) async throws { try await send("DELETE", "api/pantry/\(id)") }
}

/** Amounts as a cook reads them, as in shared/src/meals/ingredients.ts. */
enum Amounts {
    private static let glyphs: [(Double, String)] = [(0.25, "¼"), (1.0 / 3, "⅓"), (0.5, "½"), (2.0 / 3, "⅔"), (0.75, "¾")]

    static func format(_ q: Double) -> String {
        if q >= 100 { return "\(Int(q.rounded()))" }
        let whole = Int(q.rounded(.down))
        let frac = q - Double(whole)
        if frac < 0.02 { return "\(whole)" }
        if frac > 0.98 { return "\(whole + 1)" }
        if let g = glyphs.first(where: { abs($0.0 - frac) < 0.02 }) { return whole != 0 ? "\(whole) \(g.1)" : g.1 }
        let r = (q * 100).rounded() / 100
        let s = r == r.rounded(.down) ? "\(Int(r))" : "\(r)"
        return s.replacingOccurrences(of: ".", with: ",")
    }

    /** "100 g" for the given servings factor; nothing when the recipe gives no amount. */
    static func line(_ i: Ingredient, factor: Double) -> String { [i.quantity.map { format($0 * factor) }, i.unit].compactMap { $0 }.joined(separator: " ") }
}

/** The web app's meal wording. */
enum MealText {
    static let page = "Essensplan"
    static let title = "Was gibt es mittags?"
    static let lunch = "Mittag"
    static let nothing = "Noch nichts geplant"
    static let thisWeek = "Diese Woche"
    static let prev = "Woche davor"
    static let next = "Woche danach"
    static func plan(_ day: String) -> String { "Mittag am \(day)" }
    static let recipe = "Rezept"
    static let freeText = "Freier Text"
    static let search = "Rezept suchen"
    static let searchEmpty = "Kein Rezept gefunden."
    static let text = "Was gibt es?"
    static let textHint = "Zum Beispiel „Pizza bestellen“ oder „Reste“."
    static let cook = "Wer kocht?"
    static let nobody = "Noch offen"
    static let servings = "Portionen"
    static let fewer = "Eine Portion weniger"
    static let more = "Eine Portion mehr"
    static let showRecipe = "Rezept ansehen"
    static let remove = "Aus dem Plan nehmen"
    static func cooks(_ name: String) -> String { "\(name) kocht" }
    static let shopWeek = "Zutaten der Woche einkaufen"
    static let shopRecipe = "Zutaten auf die Einkaufsliste"
    static let shopTitle = "Zutaten einkaufen"
    static let special = "Das wird gebraucht"
    static let pantry = "Habt ihr das da?"
    static let pantryHint = "Grundvorrat, nur anhaken, was fehlt."
    static func putOn(_ n: Int, _ list: String) -> String { n == 1 ? "1 Sache auf „\(list)“ setzen" : "\(n) Sachen auf „\(list)“ setzen" }
    static func done(_ n: Int, _ list: String) -> String { n == 1 ? "1 Sache steht jetzt auf „\(list)“." : "\(n) Sachen stehen jetzt auf „\(list)“." }
    static let toList = "Zur Einkaufsliste"
    static let finished = "Fertig"
    static let nothingToBuy = "Für diese Tage sind keine Rezepte mit Zutaten geplant."
    static func missing(_ names: String) -> String { "Nicht gefunden in Mealie: \(names)" }
    static let ingredients = "Zutaten"
    static let steps = "So geht es"
    static let awake = "Der Bildschirm bleibt an, solange das Rezept offen ist. Erledigtes einfach antippen."
    static let staples = "Grundvorrat"
    static let staplesLead = "Was bei euch meistens da ist. Diese Zutaten fragt Stellwall beim Einkaufen nach, statt sie gleich auf die Liste zu setzen."
    static let stapleAdd = "Zum Grundvorrat"
    static let stapleName = "Neue Grundzutat"
    static func stapleRemove(_ n: String) -> String { "\(n) entfernen" }
    static let stapleExists = "Das steht schon im Grundvorrat."
    static func todayLunch(_ what: String) -> String { "Heute Mittag: \(what)" }
    static let invalid = "Bitte die Eingaben prüfen."
    static let generic = "Das hat nicht geklappt. Bitte noch einmal versuchen."
    static let save = "Speichern"
    static let cancel = "Abbrechen"
    static let errors = [
        "mealie_not_configured": "Mealie ist noch nicht verbunden. Die Verwaltung richtet das unter Mehr → Mealie ein. Freier Text geht trotzdem.",
        "mealie_auth": "Mealie hat den Schlüssel abgelehnt. Die Verwaltung muss ihn unter Mehr → Mealie erneuern.",
        "mealie_unreachable": "Mealie antwortet gerade nicht. Freier Text geht trotzdem.",
        "mealie_bad": "Mealie hat eine unerwartete Antwort geschickt.",
        "meal_list_hidden": "Du siehst die Einkaufsliste für den Essensplan nicht. Die Verwaltung kann sie freigeben.",
    ]

    static func error(_ e: Error) -> String { (e as? APIError).flatMap { errors[$0.code] } ?? generic }
    static func dayName(_ d: Day) -> String { d.format("EEEE, d.M.") }
}

/** What the meal sheet holds. */
struct MealDraft: Equatable { var useText: Bool; var recipe: RecipeRef?; var text: String; var cookId: String?; var servings: Int }

@MainActor
@Observable
final class MealsModel {
    private(set) var week: Day
    private(set) var today: Day
    private(set) var meals: [Day: Meal] = [:]
    private(set) var members: [Member] = []
    var error: String?
    let api: MealsAPI
    private let todayFn: () -> Day

    init(api: MealsAPI, today: @escaping () -> Day = { Day.today() }) {
        self.api = api
        self.todayFn = today
        self.today = today()
        self.week = today().weekStart
    }

    var days: [Day] { (0..<7).map { week.plus(days: $0) } }
    var range: String { Days.weekTitle(week) }

    func load() async {
        today = todayFn()
        do {
            if members.isEmpty { members = try await api.members() }
            let list = try await api.meals(week: week.description)
            meals = Dictionary(list.compactMap { m in Day(m.date).map { ($0, m) } }, uniquingKeysWith: { a, _ in a })
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = MealText.generic
        }
    }

    func step(_ n: Int) async { week = week.plus(days: 7 * n); await load() }
    func thisWeek() async { week = todayFn().weekStart; await load() }
    func onLive(_ e: LiveEvent) async { if e == .meals || e == .connected { await load() } }

    func draft(_ meal: Meal?) -> MealDraft {
        MealDraft(useText: meal != nil && meal?.recipe == nil, recipe: meal?.recipe, text: meal?.text ?? "", cookId: meal?.cookId, servings: meal?.servings ?? 4)
    }

    /** A tap on a recipe plans it right away; the recipe's own servings count unless they were set by hand. */
    func pick(_ date: Day, _ d: MealDraft, _ r: RecipeSummary, planned: Meal?, servingsTouched: Bool) async -> String? {
        var x = d
        x.useText = false
        x.recipe = RecipeRef(id: r.id, slug: r.slug, name: r.name)
        x.servings = servingsTouched || planned?.recipe?.id == r.id ? d.servings : r.servings
        return await save(date, x)
    }

    /** Error to show, or nil when saved. A recipe wins unless free text is chosen. */
    func save(_ date: Day, _ d: MealDraft) async -> String? {
        let useRecipe = !d.useText && d.recipe != nil
        let text = d.text.trimmingCharacters(in: .whitespaces)
        if !useRecipe && text.isEmpty { return MealText.invalid }
        return await run { try await api.saveMeal(date: date.description, recipe: useRecipe ? d.recipe : nil, text: useRecipe ? nil : text, cookId: d.cookId, servings: d.servings) }
    }

    func remove(_ date: Day) async -> String? { await run { try await api.deleteMeal(date: date.description) } }

    func search(_ q: String) async -> (recipes: [RecipeSummary], error: String?) {
        do { return (try await api.recipes(q.trimmingCharacters(in: .whitespaces)), nil) } catch { return ([], MealText.error(error)) }
    }

    private func run(_ block: () async throws -> Void) async -> String? {
        do {
            try await block()
            await load()
            return nil
        } catch {
            return MealText.generic
        }
    }
}

/** Ingredients for chosen days: what is needed ticked, the pantry asked about. */
@MainActor
@Observable
final class ShopModel {
    private(set) var preview: ShopPreview?
    var picked: Set<String> = []
    private(set) var error: String?
    private(set) var done: String?
    private(set) var doneListId: String?
    private(set) var busy = false
    private let api: MealsAPI

    init(api: MealsAPI) { self.api = api }

    static func key(_ prefix: String, _ l: ShopLine) -> String { "\(prefix)\(l.food)|\(l.quantity)" }

    /** The ticked lines, needed ones first; the same food in two units stays two lines. */
    var lines: [ShopLine] {
        guard let p = preview else { return [] }
        return p.special.filter { picked.contains(Self.key("s:", $0)) } + p.pantry.filter { picked.contains(Self.key("p:", $0)) }
    }

    func load(_ dates: [Day], servings: Int?) async {
        do {
            let p = try await api.shopPreview(dates: dates.map(\.description), servings: servings)
            preview = p
            picked = Set(p.special.map { Self.key("s:", $0) })
            error = nil
        } catch {
            self.error = MealText.error(error)
        }
    }

    func toggle(_ key: String) { if picked.contains(key) { picked.remove(key) } else { picked.insert(key) } }

    func commit() async {
        let l = lines
        if l.isEmpty { return }
        busy = true
        error = nil
        do {
            let r = try await api.shopCommit(l)
            done = MealText.done(r.added, r.listName)
            doneListId = r.listId
        } catch {
            self.error = MealText.error(error)
        }
        busy = false
    }
}

@MainActor
@Observable
final class PantryModel {
    private(set) var list: [Staple]?
    private let api: MealsAPI

    init(api: MealsAPI) { self.api = api }

    func load() async { if let l = try? await api.pantry() { list = l } }

    /** Error to show, or nil when added. */
    func add(_ name: String) async -> String? {
        let n = name.trimmingCharacters(in: .whitespaces)
        if n.isEmpty { return MealText.invalid }
        do {
            try await api.addStaple(n)
            await load()
            return nil
        } catch let e as APIError where e.code == "exists" {
            return MealText.stapleExists
        } catch {
            return MealText.generic
        }
    }

    func remove(_ s: Staple) async {
        try? await api.deleteStaple(s.id)
        await load()
    }
}
