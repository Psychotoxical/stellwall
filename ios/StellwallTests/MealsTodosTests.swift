import XCTest
import SwiftUI
@testable import Stellwall

final class FakeMeals: MealsAPI {
    var saved: [String] = []
    func members() async throws -> [Member] { [alexMember, samMember] }
    func meals(week: String) async throws -> [Meal] {
        [Meal(date: "2026-11-30", recipe: RecipeRef(id: "r1", slug: "gemuese-pfanne", name: "Gemüsepfanne"), text: nil, cookId: "sam", servings: 2, updatedBy: "me"),
         Meal(date: "2026-12-01", recipe: nil, text: "Pizza bestellen", cookId: nil, servings: 4, updatedBy: "me")]
    }
    func saveMeal(date: String, recipe: RecipeRef?, text: String?, cookId: String?, servings: Int) async throws { saved.append("\(date):\(recipe?.slug ?? "-"):\(text ?? "-"):\(servings)") }
    func deleteMeal(date: String) async throws {}
    func recipes(_ q: String) async throws -> [RecipeSummary] { [RecipeSummary(id: "r1", slug: "gemuese-pfanne", name: "Gemüsepfanne", servings: 2, hasImage: false)] }
    func recipe(_ slug: String) async throws -> Recipe { try JSONDecoder().decode(Recipe.self, from: Contract.load("recipe").body) }
    func recipeImage(_ id: String) async throws -> Data { Data() }
    func shopPreview(dates: [String], servings: Int?) async throws -> ShopPreview { try JSONDecoder().decode(ShopPreview.self, from: Contract.load("meals-shop-preview").body) }
    func shopCommit(_ lines: [ShopLine]) async throws -> CommitResult { CommitResult(added: lines.count, listId: "l1", listName: "Wocheneinkauf") }
    func pantry() async throws -> [Staple] { [] }
    func addStaple(_ name: String) async throws {}
    func deleteStaple(_ id: String) async throws {}
    var shopped: [String] = []
    func shopRecipe(slug: String, servings: Int) async throws -> ShopPreview {
        shopped.append("\(slug):\(servings)")
        return try JSONDecoder().decode(ShopPreview.self, from: Contract.load("recipe-shop-preview").body)
    }
}

@MainActor
final class MealsTodosTests: XCTestCase {
    func testAStepShowsBoldWithoutTheStars() {
        let s = MealText.step("Mit **250 g Butter** verrühren.")
        XCTAssertEqual(String(s.characters), "Mit 250 g Butter verrühren.")
        let bold = s.runs.filter { $0.inlinePresentationIntent?.contains(.stronglyEmphasized) == true }.map { String(s[$0.range].characters) }
        XCTAssertEqual(bold, ["250 g Butter"])
        XCTAssertEqual(String(MealText.step("2 * 3 Teile").characters), "2 * 3 Teile")
    }

    func testAmountsReadLikeACookWritesThem() {
        XCTAssertEqual(Amounts.format(0.5), "½")
        XCTAssertEqual(Amounts.format(1.5), "1 ½")
        XCTAssertEqual(Amounts.format(2.75), "2 ¾")
        XCTAssertEqual(Amounts.format(0.3333), "⅓")
        XCTAssertEqual(Amounts.format(1.2), "1,2")
        XCTAssertEqual(Amounts.format(250), "250")
        XCTAssertEqual(Amounts.line(Ingredient(quantity: 100, unit: "g", food: "Reis", note: ""), factor: 2), "200 g")
        XCTAssertEqual(Amounts.line(Ingredient(quantity: nil, unit: nil, food: "Salz", note: ""), factor: 2), "")
    }

    func testATapOnARecipePlansItAtOnceWithTheServingsSetBefore() async {
        let f = FakeMeals()
        let m = MealsModel(api: f, today: { Day(2026, 11, 27) })
        let veg = RecipeSummary(id: "r1", slug: "gemuese-pfanne", name: "Gemüsepfanne", servings: 2, hasImage: false)
        let fresh = m.draft(nil)
        _ = await m.pick(Day(2026, 12, 3), fresh, veg, planned: nil, servingsTouched: false)
        var touched = fresh
        touched.servings = 5
        _ = await m.pick(Day(2026, 12, 4), touched, veg, planned: nil, servingsTouched: true)
        XCTAssertEqual(f.saved, ["2026-12-03:gemuese-pfanne:-:2", "2026-12-04:gemuese-pfanne:-:5"])
        var empty = fresh
        empty.useText = true
        let e = await m.save(Day(2026, 12, 5), empty)
        XCTAssertEqual(e, MealText.invalid)
    }

    func testShoppingTicksWhatIsNeededAndAsksAboutThePantry() async {
        let shop = ShopModel(api: FakeMeals())
        await shop.load([Day(2026, 11, 30)], servings: nil)
        let pv = shop.preview!
        XCTAssertEqual(shop.lines.count, pv.special.count)
        if let first = pv.pantry.first { shop.toggle(ShopModel.key("p:", first)) }
        XCTAssertEqual(shop.lines.count, pv.special.count + (pv.pantry.isEmpty ? 0 : 1))
        await shop.commit()
        XCTAssertNotNil(shop.done)
    }

    func testToDoRulesAsTheWebAppHasThem() {
        var d = TodoDraft.of(nil)
        XCTAssertEqual(TodoForms.body(d, isCreator: true).error, TodoText.invalid)
        d.title = " Müll rausbringen "
        d.repeat = "weekly"
        XCTAssertEqual(TodoForms.body(d, isCreator: true).error, TodoText.pickDay)
        d.weekdays = [4, 1]
        XCTAssertEqual(TodoForms.body(d, isCreator: true).error, TodoText.needsDate)
        d.startDate = Day(2026, 11, 30)
        let b = TodoForms.body(d, isCreator: false).body!
        XCTAssertEqual(b["title"] as? String, "Müll rausbringen")
        XCTAssertEqual((b["recurrence"] as? [String: Any])?["weekdays"] as? [Int], [1, 4])
        XCTAssertTrue(b["time"] is NSNull)
        XCTAssertNil(b["visibility"])
    }

    func testToDosParseAsTheServerSendsThem() {
        let today = try? JSONDecoder().decode([Occurrence].self, from: Contract.load("todos-today").body)
        XCTAssertFalse(today?.isEmpty ?? true)
        XCTAssertNotNil(try? JSONDecoder().decode(TodoRule.self, from: Contract.load("todo").body))
        XCTAssertNotNil(try? JSONDecoder().decode([Meal].self, from: Contract.load("meals").body))
        XCTAssertNotNil(try? JSONDecoder().decode(Recipe.self, from: Contract.load("recipe").body))
    }

    func testARecipeFromTheBookShopsOnItsOwn() async {
        let f = FakeMeals()
        let shop = ShopModel(api: f)
        await shop.load([], servings: nil, recipe: ("pfannkuchen", 4))
        XCTAssertEqual(f.shopped, ["pfannkuchen:4"])
        XCTAssertNotNil(shop.preview)
    }

    func testTheRecipeBookAsTheServerSendsIt() async throws {
        let made = try APIClient.decoder.decode(RecipeSummary.self, from: Contract.load("recipe-imported").body)
        XCTAssertEqual(made.slug, "neu-0")
        XCTAssertEqual(made.servingsKnown, false)
        XCTAssertEqual(try APIClient.decoder.decode(Recipe.self, from: Contract.load("recipe").body).servingsKnown, true)
        StubProtocol.reset()
        StubProtocol.enqueue("recipe-imported")
        _ = try await StubProtocol.client().importRecipe(url: nil, text: "Pfannkuchen: 250 g Mehl, 3 Eier.", images: [])
        XCTAssertEqual(StubProtocol.bodyJSON(0) as NSDictionary, ["text": "Pfannkuchen: 250 g Mehl, 3 Eier."] as NSDictionary)
        StubProtocol.enqueue("recipe-import-failed")
        do {
            _ = try await StubProtocol.client().importRecipe(url: "https://example.com/kaputt", text: nil, images: [])
            XCTFail("Mealie said no")
        } catch {
            XCTAssertTrue(MealText.error(error).hasPrefix("Mealie konnte daraus kein Rezept machen"))
        }
        StubProtocol.enqueue("recipe-shop-preview")
        _ = try await StubProtocol.client().shopRecipe(slug: "pfannkuchen", servings: 4)
        XCTAssertEqual(StubProtocol.bodyJSON(2) as NSDictionary, ["recipe": ["slug": "pfannkuchen", "servings": 4]] as NSDictionary)
    }

    func testCategoriesAsTheServerSendsThem() async throws {
        let all = try APIClient.decoder.decode([RecipeCategory].self, from: Contract.load("recipe-categories").body)
        XCTAssertEqual(all.map(\.name), ["Backen", "Hauptgericht", "Indisch"])
        let book = try APIClient.decoder.decode([RecipeSummary].self, from: Contract.load("recipes").body)
        XCTAssertFalse(book.allSatisfy { $0.categories?.isEmpty ?? true })
        StubProtocol.reset()
        StubProtocol.enqueue("recipe-categories-set")
        let r = try await StubProtocol.client().setCategories(slug: "testrezept-2", ids: ["c-backen"])
        XCTAssertEqual(r.categories?.map(\.name), ["Backen"])
        XCTAssertEqual(StubProtocol.requests[0].httpMethod, "PUT")
        XCTAssertEqual(StubProtocol.bodyJSON(0) as NSDictionary, ["ids": ["c-backen"]] as NSDictionary)
    }

    func testTheBookFiltersByCategoryFullestFirst() {
        let haupt = RecipeCategory(id: "c1", slug: "hauptgericht", name: "Hauptgericht"), backen = RecipeCategory(id: "c2", slug: "backen", name: "Backen")
        let book = [
            RecipeSummary(id: "r1", slug: "pfanne", name: "Pfanne", servings: 4, hasImage: false, categories: [haupt]),
            RecipeSummary(id: "r2", slug: "kuchen", name: "Kuchen", servings: 4, hasImage: false, categories: [backen, haupt]),
            RecipeSummary(id: "r3", slug: "brot", name: "Brot", servings: 4, hasImage: false, categories: []),
        ]
        XCTAssertEqual(CategoryFilter.chips(book).map(\.name), ["Hauptgericht", "Backen"])
        var picked = CategoryFilter.flip([], "backen")
        picked = CategoryFilter.flip(picked, "hauptgericht")
        XCTAssertEqual(CategoryFilter.shown(book, picked).map(\.slug), ["kuchen"])
        picked = CategoryFilter.flip(picked, CategoryFilter.without)
        XCTAssertEqual(picked, [CategoryFilter.without])
        XCTAssertEqual(CategoryFilter.shown(book, picked).map(\.slug), ["brot"])
        XCTAssertEqual(CategoryFilter.shown(book, []).count, 3)
    }

    func testAnIngredientNoteWithUndFollowsWithoutAComma() {
        XCTAssertEqual(MealText.foodLine(Ingredient(quantity: 400, unit: "g", food: "Mehl", note: "und Mehl zum Arbeiten")), "Mehl und Mehl zum Arbeiten")
        XCTAssertEqual(MealText.foodLine(Ingredient(quantity: 2, unit: nil, food: "Paprika", note: "in Streifen")), "Paprika, in Streifen")
        XCTAssertEqual(MealText.foodLine(Ingredient(quantity: nil, unit: nil, food: "Salz", note: "")), "Salz")
    }

    func testTheRecipeBookPictures() async {
        let book = [RecipeSummary(id: "r1", slug: "gemuese-pfanne", name: "Gemüsepfanne", servings: 4, hasImage: false, categories: [RecipeCategory(id: "c1", slug: "hauptgericht", name: "Hauptgericht")]), RecipeSummary(id: "r2", slug: "zimtecken", name: "Zimtecken vom Blech", servings: 4, hasImage: false, servingsKnown: false, categories: [RecipeCategory(id: "c2", slug: "backen", name: "Backen")])]
        snap(RecipesView(api: FakeMeals(), list: book, onOpen: { _ in }, onBack: {}), world: "salbei", named: "recipes")
        snap(AddRecipeSheet(api: FakeMeals()) { _ in }, world: "psysonic", dark: true, named: "add-recipe-dark")
        let r = try! APIClient.decoder.decode(Recipe.self, from: Contract.load("recipe-categories-set").body)
        snap(CategorySheet(api: FakeMeals(), recipe: r, preset: [RecipeCategory(id: "c-backen", slug: "backen", name: "Backen"), RecipeCategory(id: "c-indisch", slug: "indisch", name: "Indisch")]) { _ in }, world: "salbei", named: "recipe-categories")
    }

    func testMealsPicture() async {
        let m = MealsModel(api: FakeMeals(), today: { Day(2026, 11, 30) })
        await m.load()
        snap(MealsView(model: m, onCook: { _ in }, onPantry: {}, onOpenList: { _ in }), world: "sonne", named: "meals")
    }
}
