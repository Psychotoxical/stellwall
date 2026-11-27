import Foundation

struct ShoppingList: Codable, Equatable, Identifiable {
    let id: String
    var name: String
    var visibility: Visibility
    let createdBy: String
    var openCount: Int
}

struct Item: Codable, Equatable, Identifiable {
    let id: String
    let listId: String
    var name: String
    var quantity: String
    var category: String
    let addedBy: String
    let addedAt: String
    var checkedAt: String?
    var checkedBy: String?
}

struct Suggestion: Codable, Equatable, Hashable {
    let name: String
    let category: String
    /** Typed in by the family, so it can be forgotten again. */
    var learned: Bool? = nil
}

/** The section a name would get; known: the catalog or the family has it, so nobody has to choose. */
struct CatalogGuess: Codable, Equatable {
    let name: String
    let category: String
    let known: Bool
}

struct LearnedEntry: Codable, Equatable, Hashable {
    let name: String
    var category: String
}

/** Store sections in shop order, as the server's shared code has them. */
let CATEGORIES = ["Obst & Gemüse", "Backwaren", "Kühlregal", "Fleisch & Fisch", "Tiefkühl", "Vorrat", "Frühstück", "Süßes & Snacks", "Getränke", "Drogerie", "Haushalt", "Tier", "Sonstiges"]

/** One line on the board "Seit du zuletzt hier warst". */
enum BoardRow: Equatable, Identifiable {
    case shopping(who: String, whoName: String, listId: String, listName: String, count: Int, latestAt: String, itemIds: [String])
    case todo(who: String, whoName: String, todoId: String, title: String, latestAt: String)
    case event(who: String, whoName: String, eventId: String, title: String, start: String, allDay: Bool, latestAt: String)

    var id: String {
        switch self {
        case let .shopping(who, _, listId, _, _, at, _): "s\(who)\(listId)\(at)"
        case let .todo(_, _, todoId, _, at): "t\(todoId)\(at)"
        case let .event(_, _, eventId, _, _, _, at): "e\(eventId)\(at)"
        }
    }

    var latestAt: String {
        switch self {
        case let .shopping(_, _, _, _, _, at, _), let .todo(_, _, _, _, at), let .event(_, _, _, _, _, _, at): at
        }
    }

    static func parse(_ data: Data) -> [BoardRow] {
        guard let rows = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else { return [] }
        return rows.compactMap { r in
            let who = r["who"] as? String ?? "", name = r["whoName"] as? String ?? "", at = r["latestAt"] as? String ?? ""
            switch r["kind"] as? String {
            case "shopping": return .shopping(who: who, whoName: name, listId: r["listId"] as? String ?? "", listName: r["listName"] as? String ?? "", count: r["count"] as? Int ?? 0, latestAt: at, itemIds: r["itemIds"] as? [String] ?? [])
            case "todo": return .todo(who: who, whoName: name, todoId: r["todoId"] as? String ?? "", title: r["title"] as? String ?? "", latestAt: at)
            case "event": return .event(who: who, whoName: name, eventId: r["eventId"] as? String ?? "", title: r["title"] as? String ?? "", start: r["start"] as? String ?? "", allDay: r["allDay"] as? Bool ?? false, latestAt: at)
            default: return nil
            }
        }
    }
}

/** What the shopping page needs from the server; the app's client and the tests' fake both have it. */
protocol ShoppingAPI {
    func members() async throws -> [Member]
    func board() async throws -> [BoardRow]
    func boardSeen() async throws
    func lists() async throws -> [ShoppingList]
    func createList(name: String, visibility: Visibility) async throws -> ShoppingList
    func updateList(id: String, name: String?, visibility: Visibility?) async throws
    func deleteList(id: String) async throws
    func clearList(id: String) async throws
    func items(listId: String) async throws -> [Item]
    func addItem(listId: String, name: String, quantity: String, category: String?) async throws
    func updateItem(id: String, checked: Bool?, name: String?, quantity: String?, category: String?) async throws
    func deleteItem(id: String) async throws
    func suggestions(_ q: String) async throws -> [Suggestion]
    func guess(_ name: String) async throws -> CatalogGuess
    func learned() async throws -> [LearnedEntry]
    func moveLearned(_ name: String, category: String) async throws
    func forgetLearned(_ name: String) async throws
}

/** Stand-ins for test doubles that do not need them; the server client has its own. */
extension ShoppingAPI {
    func guess(_ name: String) async throws -> CatalogGuess { CatalogGuess(name: name, category: CATEGORIES.last!, known: false) }
    func learned() async throws -> [LearnedEntry] { [] }
    func moveLearned(_ name: String, category: String) async throws {}
    func forgetLearned(_ name: String) async throws {}
}

extension APIClient: ShoppingAPI {
    func board() async throws -> [BoardRow] { BoardRow.parse(try await send("GET", "api/board")) }
    func boardSeen() async throws { try await send("POST", "api/board/seen") }
    func lists() async throws -> [ShoppingList] { try await json([ShoppingList].self, "GET", "api/lists") }

    func createList(name: String, visibility: Visibility) async throws -> ShoppingList {
        struct Body: Encodable { let name: String; let visibility: Visibility }
        return try await json(ShoppingList.self, "POST", "api/lists", body: Body(name: name, visibility: visibility))
    }

    func updateList(id: String, name: String?, visibility: Visibility?) async throws {
        struct Body: Encodable { let name: String?; let visibility: Visibility? }
        try await send("PATCH", "api/lists/\(id)", body: try APIClient.encoder.encode(Body(name: name, visibility: visibility)))
    }

    func deleteList(id: String) async throws { try await send("DELETE", "api/lists/\(id)") }
    func clearList(id: String) async throws { try await send("DELETE", "api/lists/\(id)/items") }
    func items(listId: String) async throws -> [Item] { try await json([Item].self, "GET", "api/lists/\(listId)/items") }

    func addItem(listId: String, name: String, quantity: String, category: String?) async throws {
        struct Body: Encodable { let name: String; let quantity: String?; let category: String? }
        try await send("POST", "api/lists/\(listId)/items", body: try APIClient.encoder.encode(Body(name: name, quantity: quantity.isEmpty ? nil : quantity, category: category)))
    }

    func updateItem(id: String, checked: Bool?, name: String?, quantity: String?, category: String?) async throws {
        struct Body: Encodable { let checked: Bool?; let name: String?; let quantity: String?; let category: String? }
        try await send("PATCH", "api/items/\(id)", body: try APIClient.encoder.encode(Body(checked: checked, name: name, quantity: quantity, category: category)))
    }

    func deleteItem(id: String) async throws { try await send("DELETE", "api/items/\(id)") }
    func suggestions(_ q: String) async throws -> [Suggestion] { try await json([Suggestion].self, "GET", "api/suggestions", query: [("q", q)]) }
    func guess(_ name: String) async throws -> CatalogGuess { try await json(CatalogGuess.self, "GET", "api/catalog/guess", query: [("name", name)]) }
    func learned() async throws -> [LearnedEntry] { try await json([LearnedEntry].self, "GET", "api/catalog/learned") }
    func moveLearned(_ name: String, category: String) async throws {
        struct Body: Encodable { let name: String; let category: String }
        try await send("PATCH", "api/catalog/learned", body: try APIClient.encoder.encode(Body(name: name, category: category)))
    }
    func forgetLearned(_ name: String) async throws { try await send("DELETE", "api/catalog/learned", query: [("name", name)]) }
}
