#if DEBUG
import SwiftUI

/** Only for UI tests in debug builds: the shopping page on sample data, no server. */
enum UITestHost {
    static var shopping: Bool { ProcessInfo.processInfo.arguments.contains("-ui-test-shopping") }
}

struct UITestShopping: View {
    @State private var model = ShoppingModel(api: SampleShoppingAPI(), me: SampleShoppingAPI.me)

    var body: some View {
        TabView {
            ShoppingView(model: model)
                .tabItem { Label("Einkauf", systemImage: "cart") }
        }
        .themed(world: "salbei", dark: false)
    }
}

final class SampleShoppingAPI: ShoppingAPI {
    static let me = Member(id: "me", username: "alex", displayName: "Alex", role: "admin", color: "person-mint", world: "salbei")
    private var items = [
        Item(id: "a", listId: "l1", name: "Milch", quantity: "2 l", category: "Kühlregal", addedBy: "me", addedAt: "2026-11-27T10:00:00.000Z", checkedAt: nil, checkedBy: nil),
        Item(id: "b", listId: "l1", name: "Bananen", quantity: "", category: "Obst & Gemüse", addedBy: "me", addedAt: "2026-11-27T10:00:00.000Z", checkedAt: nil, checkedBy: nil),
    ]
    func members() async throws -> [Member] { [Self.me] }
    func board() async throws -> [BoardRow] { [] }
    func boardSeen() async throws {}
    func lists() async throws -> [ShoppingList] { [ShoppingList(id: "l1", name: "Einkauf", visibility: .all, createdBy: "me", openCount: items.count)] }
    func createList(name: String, visibility: Visibility) async throws -> ShoppingList { ShoppingList(id: "l2", name: name, visibility: visibility, createdBy: "me", openCount: 0) }
    func updateList(id: String, name: String?, visibility: Visibility?) async throws {}
    func deleteList(id: String) async throws {}
    func clearList(id: String) async throws { items = [] }
    func items(listId: String) async throws -> [Item] { items }
    func addItem(listId: String, name: String, quantity: String, category: String?) async throws {}
    func updateItem(id: String, checked: Bool?, name: String?, quantity: String?, category: String?) async throws {
        items = items.map { i in
            var i = i
            if i.id == id, let checked { i.checkedAt = checked ? "2026-11-27T12:00:00.000Z" : nil; i.checkedBy = checked ? "me" : nil }
            return i
        }
    }
    func deleteItem(id: String) async throws { items.removeAll { $0.id == id } }
    func suggestions(_ q: String) async throws -> [Suggestion] { [] }
}
#endif
