import PDFKit
import QuickLook
import SwiftUI
import UniformTypeIdentifiers
import VisionKit

/** The documents area: the list, one document, the form after a scan or a picked file. */
struct DocumentsArea: View {
    let model: DocumentsModel
    var startId: String? = nil
    var today = Day.today()
    let onBack: () -> Void
    @State private var openId: String?
    @State private var single: DocumentDto?

    var body: some View {
        Group {
            if let id = openId, let doc = model.items.first(where: { $0.id == id }) ?? single {
                DocumentView(model: model, doc: doc, today: today) { openId = nil }
                    .backSwipe { openId = nil }
            } else {
                DocumentsView(model: model, today: today, onOpen: { openId = $0.id }, onBack: onBack)
            }
        }
        .task {
            openId = startId
            await model.load()
            if let id = startId, !model.items.contains(where: { $0.id == id }) { single = await model.get(id) }
        }
        .onDisappear { DocumentsModel.clearCache() }
    }
}

struct DocumentsView: View {
    @Bindable var model: DocumentsModel
    var today = Day.today()
    let onOpen: (DocumentDto) -> Void
    let onBack: () -> Void
    @State private var q = ""
    @State private var picked: PickedFile?
    @State private var note: String?
    @State private var scanning = false
    @State private var importing = false
    @Environment(\.palette) private var p

    struct PickedFile: Identifiable { let file: DocumentFile; var id: String { file.name + "\(file.data.count)" } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                BackLink(parent: "Start", action: onBack)
                PageHead(title: DocText.page)
                if model.notConfigured {
                    BoxCard { Text(DocText.notConfigured).font(.swBody).padding(16) }
                } else {
                    HStack(spacing: 10) {
                        if VNDocumentCameraViewController.isSupported { PrimaryButton(DocText.scan) { scanning = true } }
                        GhostButton(DocText.pick) { importing = true }
                    }
                    if let note { Notice(note) }
                    if let e = model.error { Notice(e) }
                    Field(label: DocText.search, text: $q, submit: .search)
                    WrapLayout(spacing: 8) {
                        ForEach([nil] + model.categories.map { Optional($0) }, id: \.self) { c in
                            Chip(text: c ?? DocText.all, on: c == model.category) { Task { await model.pickCategory(c) } }
                        }
                    }
                    if model.loaded && model.items.isEmpty {
                        BoxCard { Text(model.query.isEmpty && model.category == nil ? DocText.empty : DocText.none).font(.swBody).foregroundStyle(p.inkSoft.color).padding(16) }
                    }
                    if !model.items.isEmpty {
                        BoxCard {
                            ForEach(Array(model.items.enumerated()), id: \.element.id) { i, d in
                                if i > 0 { RowDivider() }
                                Button { onOpen(d) } label: { DocumentRow(doc: d, today: today) }.buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(p.ground.color.ignoresSafeArea())
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await model.load() }
        .task(id: q) {
            if q == model.query { return }
            try? await Task.sleep(for: .milliseconds(250))
            await model.search(q)
        }
        .fullScreenCover(isPresented: $scanning) {
            Scanner { file in
                scanning = false
                if let file { picked = PickedFile(file: file) }
            }
            .ignoresSafeArea()
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf, .jpeg, .png]) { result in
            guard case let .success(url) = result else { return }
            Task {
                // Read away from the screen's thread: a large file from iCloud Drive takes a while.
                let r = await Task.detached { readPicked(url) }.value
                switch r {
                case let .success(f): picked = PickedFile(file: f)
                case let .failure(e): note = e.text
                }
            }
        }
        .sheet(item: $picked) { pf in DocumentSheet(model: model, doc: nil, file: pf.file).environment(\.palette, p) }
    }
}

/** Why a picked file cannot be used, in words. */
struct PickError: Error { let text: String }

/** Reads a picked file within the 30 MB limit; the error text otherwise. */
func readPicked(_ url: URL) -> Result<DocumentFile, PickError> {
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    if let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size > MAX_BYTES { return .failure(PickError(text: DocText.tooLarge)) }
    guard let data = try? Data(contentsOf: url) else { return .failure(PickError(text: DocText.generic)) }
    if data.count > MAX_BYTES { return .failure(PickError(text: DocText.tooLarge)) }
    let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
    return .success(DocumentFile(name: url.lastPathComponent, mime: mime, data: data))
}

private struct DocumentRow: View {
    let doc: DocumentDto
    let today: Day
    @Environment(\.palette) private var p

    var body: some View {
        HStack(spacing: 12) {
            Icons.documents.image.resizable().frame(width: 24, height: 24).foregroundStyle(p.inkSoft.color)
            VStack(alignment: .leading, spacing: 2) {
                Text(doc.name).font(.swLabel).foregroundStyle(p.ink.color)
                let meta = [doc.category, doc.pages.map(DocText.pages)].compactMap { $0 }.joined(separator: " · ")
                if !meta.isEmpty { Text(meta).font(.swSmall).foregroundStyle(p.inkSoft.color) }
                if let v = doc.validUntil { Text(DocText.until(v, today: today)).font(.swSmall).foregroundStyle((DocText.soon(v, today: today) ? p.warn : p.inkSoft).color) }
                if let s = doc.snippet { Text(s).font(.swSmall).foregroundStyle(p.inkSoft.color) }
            }
            Spacer()
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

struct DocumentView: View {
    let model: DocumentsModel
    let doc: DocumentDto
    var today = Day.today()
    let onBack: () -> Void
    @State private var edit = false
    @State private var confirm = false
    @State private var error: String?
    @State private var busy = false
    @State private var preview: URL?
    @State private var shareURL: URL?
    @Environment(\.palette) private var p

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                BackLink(parent: DocText.page, action: onBack)
                PageHead(title: doc.name, sub: doc.category)
                let meta = [doc.pages.map(DocText.pages), doc.validUntil.map { DocText.until($0, today: today) }].compactMap { $0 }.joined(separator: " · ")
                if !meta.isEmpty { Text(meta).font(.swBody).foregroundStyle((doc.validUntil.map { DocText.soon($0, today: today) } ?? false ? p.warn : p.inkSoft).color) }
                if doc.ocr == "pending" { Text(DocText.ocrPending).font(.swBody).foregroundStyle(p.inkSoft.color) }
                if doc.ocr == "failed" { Text(DocText.ocrFailed).font(.swBody).foregroundStyle(p.inkSoft.color) }
                if let error { Notice(error) }
                PrimaryButton(busy ? DocText.loading : DocText.open, enabled: !busy) { fetch { preview = $0 } }
                GhostButton(DocText.share) { fetch { shareURL = $0 } }
                GhostButton(DocText.edit) { edit = true }
                if doc.createdBy == model.me.id { GhostButton(DocText.delete, danger: true) { confirm = true } }
            }
            .padding(16)
        }
        .background(p.ground.color.ignoresSafeArea())
        .quickLookPreview($preview)
        .sheet(item: Binding(get: { shareURL.map { ShareItem(url: $0) } }, set: { shareURL = $0?.url })) { s in ShareSheet(url: s.url) }
        .sheet(isPresented: $edit) { DocumentSheet(model: model, doc: doc, file: nil).environment(\.palette, p) }
        .confirmationDialog(DocText.deleteConfirm(doc.name), isPresented: $confirm, titleVisibility: .visible) {
            Button(DocText.delete, role: .destructive) {
                Task {
                    error = await model.delete(doc)
                    if error == nil { onBack() }
                }
            }
            Button(DocText.cancel, role: .cancel) {}
        }
    }

    private func fetch(_ then: @escaping (URL) -> Void) {
        busy = true
        Task {
            let (url, e) = await model.fetch(doc)
            busy = false
            error = e
            if let url { then(url) }
        }
    }
}

private struct ShareItem: Identifiable { let url: URL; var id: String { url.path } }

private struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [url], applicationActivities: nil) }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

/** The details of a new file (doc nil) or of a stored document. */
struct DocumentSheet: View {
    let model: DocumentsModel
    let doc: DocumentDto?
    let file: DocumentFile?
    @State private var name: String
    @State private var category: String
    @State private var own: Bool
    @State private var valid: Day?
    @State private var remind: Int
    @State private var visibility: Visibility
    @State private var who = false
    @State private var error: String?
    @State private var busy = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p

    init(model: DocumentsModel, doc: DocumentDto?, file: DocumentFile?) {
        self.model = model
        self.doc = doc
        self.file = file
        _name = State(initialValue: doc?.name ?? file.map { nameFromFile($0.name) } ?? "")
        _category = State(initialValue: doc?.category ?? "")
        _own = State(initialValue: doc?.category.map { !model.categories.contains($0) } ?? false)
        _valid = State(initialValue: doc?.validUntil.flatMap(Day.init))
        _remind = State(initialValue: doc?.remindDays ?? 30)
        _visibility = State(initialValue: doc?.visibility ?? .all)
    }

    var body: some View {
        SheetBody(title: doc == nil ? DocText.new : DocText.edit) {
            Field(label: DocText.name, text: $name)
            Text(DocText.category).font(.swSmall).foregroundStyle(p.inkSoft.color)
            Picker(DocText.category, selection: Binding(get: { own ? "__own" : category }, set: { v in if v == "__own" { own = true; category = "" } else { own = false; category = v } })) {
                Text(DocText.noCategory).tag("")
                ForEach(model.categories, id: \.self) { Text($0).tag($0) }
                Text(DocText.ownCategory).tag("__own")
            }
            .pickerStyle(.menu).tint(p.ink.color)
            if own { Field(label: DocText.ownLabel, text: $category) }
            Toggle(DocText.valid, isOn: Binding(get: { valid != nil }, set: { valid = $0 ? Day.today().plus(months: 12) : nil })).font(.swLabel)
            if let v = valid {
                DatePicker(DocText.valid, selection: Binding(get: { v.at(Clock(12, 0)) }, set: { valid = Day($0) }), displayedComponents: .date)
                    .environment(\.locale, Locale(identifier: "de_DE"))
                Picker(DocText.remind, selection: $remind) { ForEach(DocText.remindDays, id: \.0) { Text($0.1).tag($0.0) } }.pickerStyle(.menu).tint(p.ink.color)
            }
            if doc == nil || doc?.createdBy == model.me.id {
                GhostButton(VisText.see(visibilityLabel(visibility, members: model.members, meId: model.me.id))) { who = true }
            }
            if let error { Notice(error) }
            PrimaryButton(busy ? DocText.saving : DocText.save, enabled: !busy && !name.trimmingCharacters(in: .whitespaces).isEmpty) {
                busy = true
                let meta = DocumentMeta(name: name, category: category.isEmpty ? nil : category, validUntil: valid?.description, remindDays: remind, visibility: visibility)
                Task {
                    if let doc { error = await model.update(doc, meta) } else if let file { error = await model.upload(meta, file) }
                    busy = false
                    if error == nil { dismiss() }
                }
            }
            GhostButton(DocText.cancel) { dismiss() }
        }
        .sheet(isPresented: $who) { VisibilitySheet(lead: name, value: visibility, members: model.members, meId: model.me.id) { visibility = $0 }.environment(\.palette, p) }
    }
}

/** Apple's document scanner: edges found by itself, every page into one PDF. */
struct Scanner: UIViewControllerRepresentable {
    let done: (DocumentFile?) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let vc = VNDocumentCameraViewController()
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: VNDocumentCameraViewController, context: Context) {}

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let done: (DocumentFile?) -> Void
        init(done: @escaping (DocumentFile?) -> Void) { self.done = done }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            let pdf = PDFDocument()
            for i in 0..<scan.pageCount {
                if let page = PDFPage(image: scan.imageOfPage(at: i)) { pdf.insert(page, at: pdf.pageCount) }
            }
            guard let data = pdf.dataRepresentation() else { return done(nil) }
            done(DocumentFile(name: "Scan.pdf", mime: "application/pdf", data: data))
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) { done(nil) }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) { done(nil) }
    }
}
