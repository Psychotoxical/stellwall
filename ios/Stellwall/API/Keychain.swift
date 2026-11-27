import Foundation
import Security

/** The session cookie in the Keychain, only on this device and readable after the first unlock. */
final class KeychainCookieStore: CookieStore {
    private let account = "stellwall-session"

    var cookie: String? {
        get {
            var q = query
            q[kSecReturnData as String] = true
            q[kSecMatchLimit as String] = kSecMatchLimitOne
            var out: AnyObject?
            guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
            return String(data: data, encoding: .utf8)
        }
        set {
            SecItemDelete(query as CFDictionary)
            guard let value = newValue else { return }
            var q = query
            q[kSecValueData as String] = Data(value.utf8)
            q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(q as CFDictionary, nil)
        }
    }

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "app.stellwall", kSecAttrAccount as String: account]
    }
}

/** The server address and the light/dark choice, in plain app settings. */
final class DevicePrefs {
    private let defaults: UserDefaults
    init(_ defaults: UserDefaults = .standard) { self.defaults = defaults }

    var server: String? {
        get { defaults.string(forKey: "server") }
        set { defaults.set(newValue, forKey: "server") }
    }

    var theme: ThemeChoice {
        get { defaults.string(forKey: "theme").flatMap(ThemeChoice.init(rawValue:)) ?? .system }
        set { defaults.set(newValue.rawValue, forKey: "theme") }
    }
}
