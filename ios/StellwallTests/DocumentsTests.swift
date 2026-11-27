import XCTest
@testable import Stellwall

private func doc(_ id: String, _ name: String, category: String? = nil, validUntil: String? = nil, by: String = "me", pages: Int? = 1, ocr: String = "done", snippet: String? = nil) -> DocumentDto {
    DocumentDto(id: id, name: name, category: category, validUntil: validUntil, remindDays: 30, visibility: .all, createdBy: by, createdAt: "2026-11-27T10:00:00.000Z",
                updatedAt: "2026-11-27T10:00:00.000Z", mime: "application/pdf", size: 1000, pages: pages, ocr: ocr, snippet: snippet)
}

final class FakeDocuments: DocumentsAPI {
    var items: [DocumentDto] = []
    var calls: [String] = []
    var off = false
    func members() async throws -> [Member] { [alexMember, samMember] }
    func documents(q: String, category: String?) async throws -> [DocumentDto] {
        calls.append("list:\(q):\(category ?? "-")")
        if off { throw APIError(status: 409, code: "documents_not_configured") }
        return items.filter { (q.isEmpty || $0.name.localizedCaseInsensitiveContains(q)) && (category == nil || $0.category == category) }
    }
    func document(_ id: String) async throws -> DocumentDto { items.first { $0.id == id }! }
    func documentCategories() async throws -> [String] { ["Versicherung", "Auto", "Ausweise"] }
    func uploadDocument(_ meta: DocumentMeta, _ file: DocumentFile) async throws {
        calls.append("upload:\(meta.name):\(meta.category ?? "-"):\(meta.validUntil ?? "-"):\(meta.remindDays):\(file.name)")
    }
    func updateDocument(_ id: String, _ meta: DocumentMeta) async throws { calls.append("update:\(id):\(meta.visibility != nil)") }
    func deleteDocument(_ id: String) async throws { calls.append("delete:\(id)") }
    func documentFile(_ id: String) async throws -> Data { Data("%PDF-1.4".utf8) }
}

@MainActor
final class DocumentsTests: XCTestCase {
    override func setUp() { StubProtocol.reset() }

    func testListSearchAndCategoryGoToTheServer() async {
        let f = FakeDocuments()
        f.items = [doc("a", "Hausrat", category: "Versicherung"), doc("b", "Reisepass", category: "Ausweise")]
        let m = DocumentsModel(api: f, me: alexMember)
        await m.load()
        XCTAssertEqual(m.items.map(\.name), ["Hausrat", "Reisepass"])
        await m.search("pass")
        XCTAssertEqual(m.items.map(\.name), ["Reisepass"])
        await m.search("")
        await m.pickCategory("Versicherung")
        XCTAssertEqual(m.items.map(\.name), ["Hausrat"])
    }

    func testWithoutAKeyTheAreaSaysTheAdministrationMustSetItUp() async {
        let f = FakeDocuments()
        f.off = true
        let m = DocumentsModel(api: f, me: alexMember)
        await m.load()
        XCTAssertTrue(m.notConfigured)
        XCTAssertNil(m.error)
    }

    func testUploadTrimsAndRefusesAMissingNameAndAFileOver30MB() async {
        let f = FakeDocuments()
        let m = DocumentsModel(api: f, me: alexMember)
        let pdf = DocumentFile(name: "Scan.pdf", mime: "application/pdf", data: Data("%PDF-1.4".utf8))
        let noName = await m.upload(DocumentMeta(name: " ", category: nil, validUntil: nil, remindDays: 30), pdf)
        XCTAssertEqual(noName, DocText.invalid)
        let big = await m.upload(DocumentMeta(name: "Groß", category: nil, validUntil: nil, remindDays: 30), DocumentFile(name: "x.pdf", mime: "application/pdf", data: Data(count: MAX_BYTES + 1)))
        XCTAssertEqual(big, DocText.tooLarge)
        let ok = await m.upload(DocumentMeta(name: " Hausrat ", category: " ", validUntil: "2027-03-01", remindDays: 90, visibility: .all), pdf)
        XCTAssertNil(ok)
        XCTAssertTrue(f.calls.contains("upload:Hausrat:-:2027-03-01:90:Scan.pdf"))
    }

    func testOnlyTheCreatorSendsAVisibilityWithAChange() async {
        let f = FakeDocuments()
        f.items = [doc("a", "Hausrat", by: "sam")]
        let m = DocumentsModel(api: f, me: alexMember)
        _ = await m.update(f.items[0], DocumentMeta(name: "Hausrat neu", category: nil, validUntil: nil, remindDays: 30, visibility: Visibility(everyone: false, memberIds: [])))
        XCTAssertTrue(f.calls.contains("update:a:false"))
    }

    func testUploadSendsMetaAndFileAsFormParts() async throws {
        StubProtocol.enqueue("document-created")
        try await StubProtocol.client().uploadDocument(DocumentMeta(name: "Hausrat", category: nil, validUntil: "2027-03-01", remindDays: 30, visibility: .all),
                                                       DocumentFile(name: "Scan.pdf", mime: "application/pdf", data: Data("%PDF-1.4".utf8)))
        let req = StubProtocol.requests[0]
        XCTAssertTrue(req.value(forHTTPHeaderField: "Content-Type")!.hasPrefix("multipart/form-data; boundary="))
        let body = String(decoding: req.httpBody ?? Data(), as: UTF8.self)
        XCTAssertTrue(body.contains("name=\"meta\""))
        XCTAssertTrue(body.contains("\"category\":null"))
        XCTAssertTrue(body.contains("name=\"file\"; filename=\"Scan.pdf\""))
        XCTAssertTrue(body.contains("%PDF-1.4"))
    }

    func testTextsForDatesAndNamesFromFiles() throws {
        let today = Day(2026, 11, 27)
        XCTAssertEqual(DocText.until("2027-03-01", today: today), "gültig bis 01.03.2027")
        XCTAssertEqual(DocText.until("2026-11-01", today: today), "abgelaufen am 01.11.2026")
        XCTAssertTrue(DocText.soon("2026-12-20", today: today))
        XCTAssertEqual(nameFromFile("Hausrat_2026.pdf"), "Hausrat 2026")
        let list = try JSONDecoder().decode([DocumentDto].self, from: Contract.load("documents-search").body)
        XCTAssertEqual(list.first?.snippet, "Versicherungsschein für den Hausrat, «Beitrag» monatlich")
    }

    func testThePictures() async {
        let f = FakeDocuments()
        f.items = [doc("a", "Personalausweis", category: "Ausweise", validUntil: "2026-12-15", pages: 2),
                   doc("b", "Hausrat", category: "Versicherung", validUntil: "2027-03-01", snippet: "Beitrag «monatlich» fällig"),
                   doc("c", "Mietvertrag", pages: 7, ocr: "pending")]
        let m = DocumentsModel(api: f, me: alexMember)
        await m.load()
        snap(DocumentsView(model: m, today: Day(2026, 11, 27), onOpen: { _ in }, onBack: {}), world: "salbei", named: "documents")
        snap(DocumentView(model: m, doc: f.items[0], today: Day(2026, 11, 27), onBack: {}), world: "pink", dark: true, named: "document-dark")
    }
}
