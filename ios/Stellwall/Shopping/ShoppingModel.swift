import Foundation
import Observation

/** The web app's wording, so both read the same. */
enum ShopText {
    static let title = "Einkauf"
    static let add = "Was fehlt?"
    static let addPlaceholder = "z. B. Milch, Brot, Katzenfutter"
    static let addButton = "Hinzufügen"
    static let quantity = "Menge"
    static let manage = "Listen verwalten"
    static let empty = "Alles eingekauft. Neue Sachen oben eintragen."
    static let checked = "Heute abgehakt"
    static let vanish = "Abgehakte Sachen verschwinden um Mitternacht."
    static let newList = "Neue Liste"
    static let listName = "Name der Liste"
    static let editItem = "Eintrag bearbeiten"
    static let name = "Name"
    static let category = "Bereich im Laden"
    static let deleteItem = "Eintrag löschen"
    static let renameList = "Liste umbenennen"
    static let deleteList = "Liste löschen"
    static let clearList = "Liste leeren"
    static let save = "Speichern"
    static let cancel = "Abbrechen"
    static let generic = "Das hat nicht geklappt. Bitte noch einmal versuchen."
    static let new = "NEU"
    static func checkedBy(_ who: String) -> String { "\(who) hat abgehakt" }
    static func from(_ who: String) -> String { "von \(who)" }
    static func check(_ name: String) -> String { "\(name) abhaken" }
    static func uncheck(_ name: String) -> String { "\(name) wieder offen" }
    static func deleteListConfirm(_ name: String) -> String { "„\(name)“ mit allen Einträgen löschen?" }
    static func clearListConfirm(_ name: String) -> String { "Alle Einträge aus „\(name)“ entfernen? Die Liste selbst bleibt." }
}

struct ItemGroup: Equatable, Identifiable {
    let category: String
    let items: [Item]
    var id: String { category }
}

/** The shopping page: which list is open, its items, and what was just changed. */
@MainActor
@Observable
final class ShoppingModel {
    private(set) var loaded = false
    private(set) var lists: [ShoppingList] = []
    private(set) var list: ShoppingList?
    private(set) var items: [Item] = []
    private(set) var members: [Member] = []
    /** Items others added since the last look; frozen while the page is open. */
    private(set) var unseen: Set<String> = []
    var error: String?
    let me: Member
    private let api: ShoppingAPI
    private var unseenFrozen: Set<String>?

    init(api: ShoppingAPI, me: Member) {
        self.api = api
        self.me = me
    }

    var groups: [ItemGroup] {
        let open = items.filter { $0.checkedAt == nil }
        var out = CATEGORIES.compactMap { c in
            let inC = open.filter { $0.category == c }
            return inC.isEmpty ? nil : ItemGroup(category: c, items: inC)
        }
        let other = open.filter { !CATEGORIES.contains($0.category) }
        if !other.isEmpty { out.append(ItemGroup(category: CATEGORIES.last!, items: other)) }
        return out
    }

    var checked: [Item] { items.filter { $0.checkedAt != nil } }

    func nameOf(_ id: String?) -> String { members.first { $0.id == id }?.displayName ?? "?" }

    /** Opens `listId`, or the list already open, or the first list. */
    func load(_ listId: String? = nil) async {
        await guarded {
            let lists = try await api.lists()
            let wanted = listId ?? list?.id
            let list = lists.first { $0.id == wanted } ?? lists.first
            if members.isEmpty { members = try await api.members() }
            if unseenFrozen == nil {
                unseenFrozen = Set(try await api.board().flatMap { row -> [String] in
                    if case let .shopping(_, _, _, _, _, _, ids) = row { return ids }
                    return []
                })
            }
            var items: [Item] = []
            if let list { items = try await api.items(listId: list.id) }
            self.lists = lists
            self.list = list
            self.items = items
            self.unseen = unseenFrozen ?? []
            loaded = true
        }
    }

    private func refresh() async throws {
        let lists = try await api.lists()
        let list = lists.first { $0.id == self.list?.id } ?? lists.first
        var items: [Item] = []
        if let list { items = try await api.items(listId: list.id) }
        self.lists = lists
        self.list = list
        self.items = items
    }

    func onLive(_ e: LiveEvent) async {
        switch e {
        case .connected, .lists: await guarded(quiet: true) { try await refresh() }
        case let .list(id):
            if id == list?.id { await guarded(quiet: true) { try await refresh() } } else { await guarded(quiet: true) { lists = try await api.lists() } }
        default: break
        }
    }

    /** Leaving the page marks everything as seen. */
    func leave() async {
        unseenFrozen = nil
        try? await api.boardSeen()
    }

    /** False when there was nothing to add or it failed. */
    @discardableResult
    func add(_ name: String, quantity: String, picked: Suggestion? = nil) async -> Bool {
        let n = (picked?.name ?? name).trimmingCharacters(in: .whitespaces)
        guard let list, !n.isEmpty else { return false }
        return await guarded {
            try await api.addItem(listId: list.id, name: n, quantity: quantity.trimmingCharacters(in: .whitespaces), category: picked?.category)
            try await refresh()
        }
    }

    /** Shown at once; goes back if the server says no. */
    func toggle(_ item: Item) async {
        let check = item.checkedAt == nil
        let before = items
        error = nil
        items = items.map { i in
            guard i.id == item.id else { return i }
            var c = i
            c.checkedAt = check ? "now" : nil
            c.checkedBy = check ? me.id : nil
            return c
        }
        let ok = await guarded {
            try await api.updateItem(id: item.id, checked: check, name: nil, quantity: nil, category: nil)
            try await refresh()
        }
        if !ok { items = before }
    }

    func edit(_ item: Item, name: String, quantity: String, category: String) async -> Bool {
        let n = name.trimmingCharacters(in: .whitespaces), q = quantity.trimmingCharacters(in: .whitespaces)
        let newName = n == item.name ? nil : n, newQ = q == item.quantity ? nil : q, newC = category == item.category ? nil : category
        if newName == nil && newQ == nil && newC == nil { return true }
        if newName?.isEmpty == true { return false }
        return await guarded {
            try await api.updateItem(id: item.id, checked: nil, name: newName, quantity: newQ, category: newC)
            try await refresh()
        }
    }

    func delete(_ item: Item) async { await guarded { try await api.deleteItem(id: item.id); try await refresh() } }

    func createList(_ name: String, visibility: Visibility) async {
        await guarded {
            let l = try await api.createList(name: name.trimmingCharacters(in: .whitespaces), visibility: visibility)
            self.list = l
            try await refresh()
        }
    }

    func renameList(_ name: String) async {
        guard let list else { return }
        await guarded { try await api.updateList(id: list.id, name: name.trimmingCharacters(in: .whitespaces), visibility: nil); try await refresh() }
    }

    func setVisibility(_ v: Visibility) async {
        guard let list else { return }
        await guarded { try await api.updateList(id: list.id, name: nil, visibility: v); try await refresh() }
    }

    func clearList() async {
        guard let list else { return }
        await guarded { try await api.clearList(id: list.id); try await refresh() }
    }

    func deleteList() async {
        guard let list else { return }
        await guarded {
            try await api.deleteList(id: list.id)
            self.list = nil
            try await refresh()
        }
    }

    func suggestions(_ q: String) async -> [Suggestion] {
        let t = q.trimmingCharacters(in: .whitespaces)
        if t.isEmpty { return [] }
        return (try? await api.suggestions(t)) ?? []
    }

    @discardableResult
    private func guarded(quiet: Bool = false, _ block: () async throws -> Void) async -> Bool {
        do {
            try await block()
            return true
        } catch is CancellationError {
            return false
        } catch {
            if !quiet { self.error = ShopText.generic }
            return false
        }
    }
}
