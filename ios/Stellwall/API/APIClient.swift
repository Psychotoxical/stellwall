import Foundation

/** The server answered, but with an error: `code` is its `error` field. */
struct APIError: Error, Equatable {
    let status: Int
    let code: String
    var until: String? = nil
}

/** No answer at all: network down, server away. */
struct OfflineError: Error {}

/** Where the session cookie lives; the Keychain in the app, memory in tests. */
protocol CookieStore: AnyObject {
    var cookie: String? { get set }
}

final class MemoryCookieStore: CookieStore {
    var cookie: String?
    init(_ cookie: String? = nil) { self.cookie = cookie }
}

/**
 * Talks to one Stellwall server. Every request carries `X-Stellwall: 1` (the server's CSRF check)
 * and the session cookie, which is kept by hand so it survives in the Keychain, not in a shared jar.
 */
final class APIClient: @unchecked Sendable {
    let base: URL
    private let store: CookieStore
    private let session: URLSession
    static let cookieName = "sw_session"

    init(base: URL, store: CookieStore, session: URLSession? = nil) {
        self.base = base
        self.store = store
        if let session {
            self.session = session
        } else {
            let c = URLSessionConfiguration.ephemeral
            c.httpCookieStorage = nil
            c.httpShouldSetCookies = false
            c.timeoutIntervalForRequest = 20
            self.session = URLSession(configuration: c)
        }
    }

    static let decoder = JSONDecoder()
    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    func url(_ path: String, _ query: [(String, String?)] = []) -> URL {
        var c = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        let items = query.compactMap { k, v in v.map { URLQueryItem(name: k, value: $0) } }
        if !items.isEmpty { c.queryItems = items }
        return c.url!
    }

    /** Sends a request and returns the body; non-2xx answers become APIError. */
    @discardableResult
    func send(_ method: String, _ path: String, query: [(String, String?)] = [], body: Data? = nil, contentType: String = "application/json", timeout: TimeInterval? = nil) async throws -> Data {
        var req = URLRequest(url: url(path, query))
        req.httpMethod = method
        req.setValue("1", forHTTPHeaderField: "X-Stellwall")
        if let cookie = store.cookie { req.setValue("\(Self.cookieName)=\(cookie)", forHTTPHeaderField: "Cookie") }
        if let timeout { req.timeoutInterval = timeout }
        if let body {
            req.httpBody = body
            req.setValue(contentType, forHTTPHeaderField: "Content-Type")
        } else if method == "POST" || method == "PATCH" || method == "PUT" {
            req.httpBody = Data("{}".utf8)
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch is CancellationError {
            throw CancellationError()
        } catch let e as URLError where e.code == .cancelled {
            throw CancellationError()
        } catch {
            throw OfflineError()
        }
        guard let http = response as? HTTPURLResponse else { throw OfflineError() }
        keepCookie(http)
        guard (200..<300).contains(http.statusCode) else {
            let err = (try? Self.decoder.decode(ErrorBody.self, from: data)) ?? ErrorBody(error: "", until: nil)
            throw APIError(status: http.statusCode, code: err.error, until: err.until)
        }
        return data
    }

    func json<T: Decodable>(_ type: T.Type, _ method: String, _ path: String, query: [(String, String?)] = [], body: (any Encodable)? = nil) async throws -> T {
        let data = try await send(method, path, query: query, body: try body.map { try Self.encoder.encode($0) })
        return try Self.decoder.decode(T.self, from: data)
    }

    private func keepCookie(_ http: HTTPURLResponse) {
        guard let header = http.value(forHTTPHeaderField: "Set-Cookie") else { return }
        for part in header.components(separatedBy: ",") {
            let pair = part.trimmingCharacters(in: .whitespaces).components(separatedBy: ";")[0]
            guard pair.hasPrefix("\(Self.cookieName)=") else { continue }
            let value = String(pair.dropFirst(Self.cookieName.count + 1))
            let expired = part.lowercased().contains("max-age=0") || value.isEmpty
            store.cookie = expired ? nil : value
        }
    }

    func forgetSession() { store.cookie = nil }
    var sessionCookie: String? { store.cookie }
}

private struct ErrorBody: Decodable {
    let error: String
    let until: String?

    init(error: String, until: String?) {
        self.error = error
        self.until = until
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        error = (try? c.decode(String.self, forKey: .error)) ?? ""
        until = try? c.decode(String.self, forKey: .until)
    }

    enum CodingKeys: String, CodingKey { case error, until }
}

/** The address people type in: a bare host gets https, any path is dropped. */
enum ServerAddress {
    static func parse(_ input: String) -> URL? {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty || text.contains(where: { $0.isWhitespace }) { return nil }
        let withScheme = text.contains("://") ? text : "https://\(text)"
        guard var c = URLComponents(string: withScheme), let host = c.host, !host.isEmpty, c.scheme == "https" || c.scheme == "http" else { return nil }
        c.path = "/"
        c.query = nil
        c.fragment = nil
        return c.url
    }

    /** "wall.example.org" instead of "https://wall.example.org/", as people type it. */
    static func shown(_ url: String?) -> String {
        var s = url ?? ""
        if s.hasPrefix("https://") { s.removeFirst(8) }
        if s.hasSuffix("/") { s.removeLast() }
        return s
    }
}

/** A value for a JSON body, or JSON null. */
func orNull(_ v: Any?) -> Any { v ?? NSNull() }
