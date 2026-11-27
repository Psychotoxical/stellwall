import XCTest
import SwiftUI
@testable import Stellwall

let alexMember = Member(id: "me", username: "alex", displayName: "Alex", role: "admin", color: "person-mint", world: "salbei")
let samMember = Member(id: "sam", username: "sam", displayName: "Sam", role: "member", color: "person-lilac", world: "flieder")

func item(_ id: String, _ name: String, _ category: String, by: String = "me", checked: Bool = false, quantity: String = "") -> Item {
    Item(id: id, listId: "l1", name: name, quantity: quantity, category: category, addedBy: by, addedAt: "2026-11-27T09:00:00.000Z", checkedAt: checked ? "2026-11-27T10:00:00.000Z" : nil, checkedBy: checked ? "sam" : nil)
}

final class FakeShopping: ShoppingAPI {
    var lists: [ShoppingList] = [ShoppingList(id: "l1", name: "Einkauf", visibility: .all, createdBy: "me", openCount: 3), ShoppingList(id: "l2", name: "Drogerie", visibility: .all, createdBy: "sam", openCount: 0)]
    var items: [String: [Item]] = [:]
    var board: [BoardRow] = []
    var calls: [String] = []
    var failUpdate = false

    func members() async throws -> [Member] { [alexMember, samMember] }
    func board() async throws -> [BoardRow] { board }
    func boardSeen() async throws { calls.append("seen") }
    func lists() async throws -> [ShoppingList] { lists }
    func createList(name: String, visibility: Stellwall.Visibility) async throws -> ShoppingList {
        let l = ShoppingList(id: "l3", name: name, visibility: visibility, createdBy: "me", openCount: 0)
        lists.append(l)
        return l
    }
    func updateList(id: String, name: String?, visibility: Stellwall.Visibility?) async throws { calls.append("updateList:\(id):\(name ?? "-")") }
    func deleteList(id: String) async throws { calls.append("deleteList:\(id)"); lists.removeAll { $0.id == id } }
    func clearList(id: String) async throws { calls.append("clearList:\(id)"); items[id] = [] }
    func items(listId: String) async throws -> [Item] { items[listId] ?? [] }
    func addItem(listId: String, name: String, quantity: String, category: String?) async throws { calls.append("add:\(name):\(quantity):\(category ?? "-")") }
    func updateItem(id: String, checked: Bool?, name: String?, quantity: String?, category: String?) async throws {
        calls.append("update:\(id):\(checked.map { "\($0)" } ?? "-"):\(name ?? "-")")
        if failUpdate { throw OfflineError() }
    }
    func deleteItem(id: String) async throws { calls.append("delete:\(id)") }
    func suggestions(_ q: String) async throws -> [Suggestion] { [Suggestion(name: "Milch", category: "Kühlregal")] }
}

@MainActor
final class ShoppingTests: XCTestCase {
    private func sample() -> FakeShopping {
        let f = FakeShopping()
        f.items["l1"] = [item("a", "Shampoo", "Drogerie"), item("b", "Äpfel", "Obst & Gemüse", by: "sam", quantity: "1 kg"), item("c", "Brot", "Backwaren", checked: true), item("d", "Bananen", "Obst & Gemüse")]
        f.board = [.shopping(who: "sam", whoName: "Sam", listId: "l1", listName: "Einkauf", count: 1, latestAt: "2026-11-27T10:02:00.000Z", itemIds: ["b"])]
        return f
    }

    func testOpenItemsAreGroupedInShopOrderCheckedOnesApart() async {
        let m = ShoppingModel(api: sample(), me: alexMember)
        await m.load()
        XCTAssertEqual(m.list?.id, "l1")
        XCTAssertEqual(m.groups.map(\.category), ["Obst & Gemüse", "Drogerie"])
        XCTAssertEqual(m.groups[0].items.map(\.name), ["Äpfel", "Bananen"])
        XCTAssertEqual(m.checked.map(\.name), ["Brot"])
        XCTAssertEqual(m.unseen, ["b"])
    }

    func testAToggleShowsAtOnceAndGoesBackWhenTheServerSaysNo() async {
        let f = sample()
        f.failUpdate = true
        let m = ShoppingModel(api: f, me: alexMember)
        await m.load()
        await m.toggle(m.groups[0].items[0])
        XCTAssertNil(m.items.first { $0.id == "b" }?.checkedAt)
        XCTAssertEqual(m.error, ShopText.generic)
    }

    func testAPickNeedsANameASuggestionBringsItsSectionTheAmountComesFromTheSheet() async {
        let f = sample()
        let m = ShoppingModel(api: f, me: alexMember)
        await m.load()
        let none = await m.pick("  ", picked: nil, shown: [])
        XCTAssertNil(none)
        let shown = await m.pick("milch", picked: nil, shown: [Suggestion(name: "Milch", category: "Kühlregal")])
        XCTAssertEqual(shown, Pick(name: "Milch", category: "Kühlregal", known: true))
        let unknown = await m.pick("Schinkenwurst", picked: nil, shown: [])
        XCTAssertEqual(unknown, Pick(name: "Schinkenwurst", category: "Sonstiges", known: false))
        let pick = await m.pick("mil", picked: Suggestion(name: "Milch", category: "Kühlregal"), shown: [])
        await m.add(pick!, quantity: " 2 ", category: "Kühlregal")
        XCTAssertTrue(f.calls.contains("add:Milch:2:Kühlregal"))
        await m.clearList()
        XCTAssertTrue(f.calls.contains("clearList:l1"))
        XCTAssertTrue(m.items.isEmpty)
    }

    func testTheBoardReadsLikeTheWebApp() {
        let berlin = TimeZone(identifier: "Europe/Berlin")!
        XCTAssertEqual(StartText.line(.shopping(who: "s", whoName: "Sam", listId: "l", listName: "Einkauf", count: 2, latestAt: "", itemIds: [])), "Sam hat 2 Sachen auf „Einkauf“ gesetzt")
        XCTAssertEqual(StartText.time("2026-11-27T10:02:00.000Z", zone: berlin), "11:02")
        XCTAssertEqual(StartText.hello("Frank", hour: 9), "Guten Morgen, Frank")
        XCTAssertEqual(StartText.hello("Frank", hour: 23), "Gute Nacht, Frank")
        XCTAssertEqual(StartText.today(ISO8601.date("2026-11-27T10:00:00.000Z")!, zone: berlin), "Freitag, 27. November")
    }

    func testTheBoardAndLiveHintsParseAsTheServerSendsThem() {
        let c = Contract.load("board")
        XCTAssertFalse(BoardRow.parse(c.body).isEmpty)
        XCTAssertEqual(LiveEvent.parse("{\"type\":\"list\",\"id\":\"l1\"}"), .list("l1"))
        XCTAssertEqual(LiveEvent.parse("{\"type\":\"documents\"}"), .documents)
        XCTAssertNil(LiveEvent.parse("{\"type\":\"nope\"}"))
    }

    func testLearnedSuggestionsAndGuessesParseAsTheServerSendsThem() async throws {
        StubProtocol.reset()
        StubProtocol.enqueue("suggestions-learned")
        let s = try await StubProtocol.client().suggestions("schinken")
        XCTAssertEqual(s[0], Suggestion(name: "Schinkenwurst", category: "Sonstiges", learned: true))
        XCTAssertNil(s[1].learned)
        StubProtocol.enqueue("catalog-guess")
        let g = try await StubProtocol.client().guess("Zwiebel(n)")
        XCTAssertEqual(g, CatalogGuess(name: "Zwiebeln", category: "Obst & Gemüse", known: true))
        XCTAssertTrue(StubProtocol.requests[1].url!.query!.contains("name=Zwiebel(n)"))
        StubProtocol.enqueue("catalog-learned")
        let learned = try await StubProtocol.client().learned()
        XCTAssertEqual(learned, [LearnedEntry(name: "Schinkenwurst", category: "Sonstiges")])
        StubProtocol.enqueue("catalog-learned-moved")
        try await StubProtocol.client().moveLearned("Schinkenwurst", category: "Fleisch & Fisch")
        XCTAssertEqual(StubProtocol.requests[3].httpMethod, "PATCH")
        StubProtocol.enqueue("catalog-learned-forgotten")
        try await StubProtocol.client().forgetLearned("Schinkenwurst")
        XCTAssertEqual(StubProtocol.requests[4].httpMethod, "DELETE")
        XCTAssertTrue(StubProtocol.requests[4].url!.query!.contains("name=Schinkenwurst"))
    }

    func testTheAmountSheetPictures() {
        snap(AmountSheet(pick: Pick(name: "Schinkenwurst", category: "Sonstiges", known: false)) { _, _ in }, world: "salbei", named: "amount-new-name")
        snap(AmountSheet(pick: Pick(name: "Milch", category: "Kühlregal", known: true)) { _, _ in }, world: "psysonic", dark: true, named: "amount-psysonic-dark")
    }

    func testStartAndShoppingPictures() async {
        let f = sample()
        let start = StartModel(board: { f.board })
        await start.load()
        snap(StartView(member: alexMember, model: start, today: ISO8601.date("2026-11-27T10:00:00.000Z")!, hour: 9, onMore: {}, banner: { EmptyView() }, mine: { EmptyView() }) { _ in }, world: "salbei", named: "start")
        let m = ShoppingModel(api: f, me: alexMember)
        await m.load()
        snap(ShoppingView(model: m), world: "pink", named: "shopping")
        snap(ShoppingView(model: m), world: "himmel", dark: true, named: "shopping-dark")
    }
}
