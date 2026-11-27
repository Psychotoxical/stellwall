import Foundation
import Observation

struct DocumentDto: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let category: String?
    let validUntil: String?
    let remindDays: Int
    let visibility: Visibility
    let createdBy: String
    let createdAt: String
    let updatedAt: String
    let mime: String
    let size: Int
    let pages: Int?
    /** "pending" while the text is being read, "done", or "failed". */
    let ocr: String
    /** A piece of the recognized text around a search hit, the hit in « ». */
    let snippet: String?
}

/** What is sent with a new file, and what can be changed later (visibility only by the creator). */
struct DocumentMeta: Equatable {
    var name: String
    var category: String?
    var validUntil: String?
    var remindDays: Int
    var visibility: Visibility?

    /** Category and date go as null when cleared; visibility only when it may be changed. */
    var json: Data {
        var b: [String: Any] = ["name": name, "category": orNull(category), "validUntil": orNull(validUntil), "remindDays": remindDays]
        if let v = visibility { b["visibility"] = ["everyone": v.everyone, "memberIds": v.memberIds] }
        return try! JSONSerialization.data(withJSONObject: b)
    }
}

/** A file picked or scanned on the phone, read into memory (at most 30 MB). */
struct DocumentFile: Equatable { let name: String; let mime: String; let data: Data }

enum DocText {
    static let page = "Dokumente"
    static let scan = "Scannen"
    static let pick = "Datei wählen"
    static let search = "Dokumente durchsuchen"
    static let all = "Alle"
    static let empty = "Noch keine Dokumente. Scanne das erste oder wähle eine Datei."
    static let none = "Nichts gefunden. Die Suche findet Wörter im Namen, in der Kategorie und im Text des Dokuments."
    static let new = "Neues Dokument"
    static let edit = "Bearbeiten"
    static let name = "Name"
    static let category = "Kategorie"
    static let noCategory = "Keine"
    static let ownCategory = "Eigene Kategorie …"
    static let ownLabel = "Eigene Kategorie"
    static let valid = "Gültig bis"
    static let remind = "Erinnern"
    static let remindDays = [(7, "1 Woche vorher"), (30, "1 Monat vorher"), (90, "3 Monate vorher")]
    static let save = "Speichern"
    static let saving = "Wird hochgeladen …"
    static let loading = "Wird geladen …"
    static let cancel = "Abbrechen"
    static let open = "Öffnen"
    static let share = "Teilen oder speichern"
    static let delete = "Löschen"
    static func deleteConfirm(_ name: String) -> String { "„\(name)“ löschen? Die Datei ist dann weg." }
    static let ocrPending = "Text wird erkannt …"
    static let ocrFailed = "Text nicht erkannt. Das Dokument ist über Name und Kategorie zu finden."
    static let notConfigured = "Die Verwaltung muss Dokumente erst einrichten."
    static let tooLarge = "Die Datei ist größer als 30 MB."
    static let badType = "Diese Datei geht nicht. Erlaubt sind PDF, JPG und PNG."
    static let invalid = "Bitte die Eingaben prüfen."
    static let generic = "Das hat nicht geklappt. Bitte gleich noch einmal versuchen."
    static let offline = "Keine Verbindung zum Server."

    static func show(_ iso: String) -> String { Day(iso)?.format("dd.MM.yyyy") ?? iso }
    static func pages(_ n: Int) -> String { n == 1 ? "1 Seite" : "\(n) Seiten" }
    static func until(_ iso: String, today: Day) -> String {
        guard let d = Day(iso) else { return "" }
        return d < today ? "abgelaufen am \(show(iso))" : "gültig bis \(show(iso))"
    }
    /** From a month before it runs out the date is marked. */
    static func soon(_ iso: String, today: Day) -> Bool { Day(iso).map { today.days(to: $0) <= 30 } ?? false }

    static func error(_ e: Error) -> String {
        if let e = e as? APIError {
            switch e.code {
            case "documents_not_configured": return notConfigured
            case "too_large": return tooLarge
            case "unsupported_type": return badType
            case "invalid_input": return invalid
            default: return generic
            }
        }
        return e is OfflineError ? offline : generic
    }
}

let MAX_BYTES = 30 * 1024 * 1024

protocol DocumentsAPI {
    func members() async throws -> [Member]
    func documents(q: String, category: String?) async throws -> [DocumentDto]
    func document(_ id: String) async throws -> DocumentDto
    func documentCategories() async throws -> [String]
    func uploadDocument(_ meta: DocumentMeta, _ file: DocumentFile) async throws
    func updateDocument(_ id: String, _ meta: DocumentMeta) async throws
    func deleteDocument(_ id: String) async throws
    func documentFile(_ id: String) async throws -> Data
}

extension APIClient: DocumentsAPI {
    func documents(q: String, category: String?) async throws -> [DocumentDto] {
        let t = q.trimmingCharacters(in: .whitespaces)
        return try await json([DocumentDto].self, "GET", "api/documents", query: [("q", t.isEmpty ? nil : t), ("category", category)])
    }

    func document(_ id: String) async throws -> DocumentDto { try await json(DocumentDto.self, "GET", "api/documents/\(id)") }
    func documentCategories() async throws -> [String] { try await json([String].self, "GET", "api/document-categories") }

    func uploadDocument(_ meta: DocumentMeta, _ file: DocumentFile) async throws {
        let boundary = "stellwall-\(UUID().uuidString)"
        var body = Data()
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"meta\"\r\n\r\n".utf8))
        body.append(meta.json)
        let safeName = file.name.replacingOccurrences(of: "\"", with: "_")
        body.append(Data("\r\n--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(safeName)\"\r\nContent-Type: \(file.mime)\r\n\r\n".utf8))
        body.append(file.data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        try await send("POST", "api/documents", body: body, contentType: "multipart/form-data; boundary=\(boundary)", timeout: 120)
    }

    func updateDocument(_ id: String, _ meta: DocumentMeta) async throws { try await send("PATCH", "api/documents/\(id)", body: meta.json) }
    func deleteDocument(_ id: String) async throws { try await send("DELETE", "api/documents/\(id)") }
    func documentFile(_ id: String) async throws -> Data { try await send("GET", "api/documents/\(id)/file", timeout: 120) }
}

@MainActor
@Observable
final class DocumentsModel {
    private(set) var items: [DocumentDto] = []
    var query = ""
    private(set) var category: String?
    private(set) var categories: [String] = []
    private(set) var members: [Member] = []
    private(set) var loaded = false
    private(set) var notConfigured = false
    var error: String?
    let me: Member
    private let api: DocumentsAPI

    init(api: DocumentsAPI, me: Member) {
        self.api = api
        self.me = me
    }

    func load() async {
        do {
            items = try await api.documents(q: query, category: category)
            categories = try await api.documentCategories()
            if members.isEmpty { members = try await api.members() }
            loaded = true
            notConfigured = false
            error = nil
        } catch is CancellationError {
        } catch let e as APIError where e.code == "documents_not_configured" {
            loaded = true
            notConfigured = true
        } catch {
            loaded = true
            self.error = DocText.error(error)
        }
    }

    func search(_ q: String) async { query = q; await load() }
    func pickCategory(_ c: String?) async { category = c; await load() }
    func onLive(_ e: LiveEvent) async { if e == .documents || e == .connected { await load() } }

    /** Error to show, or nil when stored. */
    func upload(_ meta: DocumentMeta, _ file: DocumentFile) async -> String? {
        if meta.name.trimmingCharacters(in: .whitespaces).isEmpty { return DocText.invalid }
        if file.data.count > MAX_BYTES { return DocText.tooLarge }
        var m = meta
        m.name = meta.name.trimmingCharacters(in: .whitespaces)
        m.category = meta.category?.trimmingCharacters(in: .whitespaces).nilIfEmpty
        return await attempt { try await api.uploadDocument(m, file) }
    }

    func update(_ doc: DocumentDto, _ meta: DocumentMeta) async -> String? {
        if meta.name.trimmingCharacters(in: .whitespaces).isEmpty { return DocText.invalid }
        var m = meta
        m.name = meta.name.trimmingCharacters(in: .whitespaces)
        m.category = meta.category?.trimmingCharacters(in: .whitespaces).nilIfEmpty
        if doc.createdBy != me.id { m.visibility = nil }
        return await attempt { try await api.updateDocument(doc.id, m) }
    }

    func delete(_ doc: DocumentDto) async -> String? { await attempt { try await api.deleteDocument(doc.id) } }
    func get(_ id: String) async -> DocumentDto? { try? await api.document(id) }

    /** Fetches the file into a temporary folder for QuickLook; nil and an error text when it fails. */
    func fetch(_ doc: DocumentDto) async -> (URL?, String?) {
        do {
            let data = try await api.documentFile(doc.id)
            let ext = ["application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png"][doc.mime] ?? "bin"
            let safe = String(doc.name.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) || " ._-".unicodeScalars.contains($0) ? Character($0) : "_" }).prefix(80)
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent("documents", isDirectory: true)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appendingPathComponent("\(safe.isEmpty ? "Dokument" : String(safe)).\(ext)")
            try data.write(to: url, options: .completeFileProtection)
            return (url, nil)
        } catch {
            return (nil, DocText.error(error))
        }
    }

    /** Files fetched for the viewer stay only while the area is open. */
    static func clearCache() { try? FileManager.default.removeItem(at: FileManager.default.temporaryDirectory.appendingPathComponent("documents")) }

    private func attempt(_ block: () async throws -> Void) async -> String? {
        do {
            try await block()
            await load()
            return nil
        } catch {
            return DocText.error(error)
        }
    }
}

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

/** "Hausrat_2026.pdf" → "Hausrat 2026", as in the web app. */
func nameFromFile(_ file: String) -> String {
    let base = file.replacingOccurrences(of: "\\.[^.]{1,5}$", with: "", options: .regularExpression)
    return String(base.replacingOccurrences(of: "_", with: " ").trimmingCharacters(in: .whitespaces).prefix(120))
}
