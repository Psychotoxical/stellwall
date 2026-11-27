import Foundation

/**
 * Change hints for as long as the stream is read. The connection pings every 30 s, so a link that
 * died without closing (Wi-Fi to mobile data) fails and is opened again, waiting a little longer
 * each time (up to 30 s); each new connection starts with `.connected`.
 */
extension APIClient {
    func live() -> AsyncStream<LiveEvent> {
        AsyncStream { continuation in
            let task = Task {
                var wait: UInt64 = 1
                while !Task.isCancelled {
                    var c = URLComponents(url: base.appendingPathComponent("api/live"), resolvingAgainstBaseURL: false)!
                    c.scheme = c.scheme == "https" ? "wss" : "ws"
                    var req = URLRequest(url: c.url!)
                    req.setValue("1", forHTTPHeaderField: "X-Stellwall")
                    if let cookie = sessionCookie { req.setValue("\(APIClient.cookieName)=\(cookie)", forHTTPHeaderField: "Cookie") }
                    let ws = URLSession.shared.webSocketTask(with: req)
                    ws.resume()
                    let pinger = Task {
                        while !Task.isCancelled {
                            try? await Task.sleep(for: .seconds(30))
                            ws.sendPing { error in if error != nil { ws.cancel(with: .goingAway, reason: nil) } }
                        }
                    }
                    do {
                        while !Task.isCancelled {
                            let msg = try await ws.receive()
                            wait = 1
                            if case let .string(text) = msg, let e = LiveEvent.parse(text) { continuation.yield(e) }
                        }
                    } catch {}
                    pinger.cancel()
                    ws.cancel(with: .goingAway, reason: nil)
                    if Task.isCancelled { break }
                    try? await Task.sleep(for: .seconds(Double(wait)))
                    wait = min(wait * 2, 30)
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
