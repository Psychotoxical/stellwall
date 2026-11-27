import Foundation

/** A family member as the server sends it (MemberDto). */
struct Member: Codable, Equatable, Identifiable {
    let id: String
    let username: String
    var displayName: String
    let role: String
    var color: String
    var world: String
    /** The administration chose the password; the member is asked for an own one first. */
    var mustChangePassword: Bool

    init(id: String, username: String, displayName: String, role: String, color: String, world: String, mustChangePassword: Bool = false) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.role = role
        self.color = color
        self.world = world
        self.mustChangePassword = mustChangePassword
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        username = try c.decode(String.self, forKey: .username)
        displayName = try c.decode(String.self, forKey: .displayName)
        role = try c.decode(String.self, forKey: .role)
        color = try c.decode(String.self, forKey: .color)
        world = try c.decode(String.self, forKey: .world)
        mustChangePassword = (try? c.decode(Bool.self, forKey: .mustChangePassword)) ?? false
    }
}

/** Who sees something: everyone, or the listed members (the creator is always among them). */
struct Visibility: Codable, Equatable {
    var everyone: Bool
    var memberIds: [String]

    static let all = Visibility(everyone: true, memberIds: [])
}

struct OK: Decodable {}

/** A hint from the live connection: something changed, fetch it again. */
enum LiveEvent: Equatable {
    /** (Re)connected: anything may have changed while away. */
    case connected
    case list(String)
    case lists
    case calendar
    case todos
    case meals
    case documents

    static func parse(_ text: String) -> LiveEvent? {
        guard let obj = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any], let type = obj["type"] as? String else { return nil }
        switch type {
        case "hello": return .connected
        case "list": return (obj["id"] as? String).map { .list($0) }
        case "lists": return .lists
        case "calendar": return .calendar
        case "todos": return .todos
        case "meals": return .meals
        case "documents": return .documents
        default: return nil
        }
    }
}

extension APIClient {
    func login(username: String, password: String) async throws -> Member {
        try await json(Member.self, "POST", "api/auth/login", body: ["username": username, "password": password])
    }

    /** The signed-in member, or nil when the session is gone. */
    func me() async throws -> Member? {
        do {
            return try await json(Member.self, "GET", "api/me")
        } catch let e as APIError where e.status == 401 {
            return nil
        }
    }

    /** Signs out on the server if it answers; the cookie is forgotten either way. */
    func logout(pushEndpoint: String?) async {
        struct Body: Encodable { let pushEndpoint: String? }
        _ = try? await send("POST", "api/auth/logout", body: try? APIClient.encoder.encode(Body(pushEndpoint: pushEndpoint)))
        forgetSession()
    }

    func members() async throws -> [Member] { try await json([Member].self, "GET", "api/members") }

    func changePassword(current: String, next: String) async throws {
        try await send("POST", "api/me/password", body: try APIClient.encoder.encode(["current": current, "next": next]))
    }
}
