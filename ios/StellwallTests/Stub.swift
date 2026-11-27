import Foundation
@testable import Stellwall

/** The server's example answers in `contract/`, as the Android tests read them. */
enum Contract {
    static let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("contract")

    static func load(_ name: String) -> (status: Int, body: Data) {
        let data = try! Data(contentsOf: dir.appendingPathComponent("\(name).json"))
        let obj = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
        let body = try! JSONSerialization.data(withJSONObject: obj["body"]!, options: [.fragmentsAllowed])
        return (obj["status"] as! Int, body)
    }
}

/** A stand-in for the network: answers are queued, requests are kept for checking. */
final class StubProtocol: URLProtocol {
    struct Answer {
        var status: Int
        var body: Data
        var headers: [String: String] = [:]
    }

    nonisolated(unsafe) static var answers: [Answer] = []
    nonisolated(unsafe) static var requests: [URLRequest] = []
    nonisolated(unsafe) static var offline = false

    static func reset() {
        answers = []
        requests = []
        offline = false
    }

    static func enqueue(_ name: String, headers: [String: String] = [:]) {
        let c = Contract.load(name)
        answers.append(Answer(status: c.status, body: c.body, headers: headers))
    }

    static func enqueue(status: Int, json: String) { answers.append(Answer(status: status, body: Data(json.utf8))) }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        var req = request
        if req.httpBody == nil, let stream = req.httpBodyStream {
            stream.open()
            var data = Data()
            let buf = UnsafeMutablePointer<UInt8>.allocate(capacity: 65536)
            while stream.hasBytesAvailable {
                let n = stream.read(buf, maxLength: 65536)
                if n <= 0 { break }
                data.append(buf, count: n)
            }
            buf.deallocate()
            stream.close()
            req.httpBody = data
        }
        Self.requests.append(req)
        if Self.offline || Self.answers.isEmpty {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }
        let a = Self.answers.removeFirst()
        var headers = a.headers
        headers["Content-Type"] = "application/json"
        let res = HTTPURLResponse(url: request.url!, statusCode: a.status, httpVersion: "HTTP/1.1", headerFields: headers)!
        client?.urlProtocol(self, didReceive: res, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: a.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    static func session() -> URLSession {
        let c = URLSessionConfiguration.ephemeral
        c.protocolClasses = [StubProtocol.self]
        c.httpCookieStorage = nil
        c.httpShouldSetCookies = false
        return URLSession(configuration: c)
    }

    static func client(_ store: CookieStore = MemoryCookieStore()) -> APIClient {
        APIClient(base: URL(string: "https://wall.example.org/")!, store: store, session: session())
    }

    static func bodyJSON(_ i: Int) -> [String: Any] {
        (try? JSONSerialization.jsonObject(with: requests[i].httpBody ?? Data())) as? [String: Any] ?? [:]
    }
}
