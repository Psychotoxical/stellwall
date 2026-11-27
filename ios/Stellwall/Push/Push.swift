import FirebaseCore
import FirebaseMessaging
import SwiftUI
import UIKit
import UserNotifications

/**
 * Push on this iPhone through Firebase (APNs underneath). Without GoogleService-Info.plist in the
 * build (the CI test build) everything here stays off and the app runs without notifications.
 */
enum Push {
    static var available: Bool { Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil }

    static func configure() {
        guard available, FirebaseApp.app() == nil else { return }
        FirebaseApp.configure()
    }

    /** Whether the person allowed notifications for Stellwall. */
    static func allowed() async -> Bool {
        let s = await UNUserNotificationCenter.current().notificationSettings()
        return s.authorizationStatus == .authorized || s.authorizationStatus == .provisional
    }

    /** Asks once; afterwards only the Settings app can change it. */
    static func ask() async -> Bool {
        let ok = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if ok { await MainActor.run { UIApplication.shared.registerForRemoteNotifications() } }
        return ok
    }

    /** The FCM token of this phone, or nil (no Firebase in this build, no APNs token yet). */
    static func token() async -> String? {
        guard available else { return nil }
        return try? await Messaging.messaging().token()
    }

    /** "fcm:<token>", as the server stores phones; sent at sign-out so this phone gets nothing more. */
    static func endpoint() async -> String? { await token().map { "fcm:\($0)" } }

    static var label: String { "iPhone · \(UIDevice.current.name)" }
}

/** Where tapped notifications lead; the shell takes a link and clears it. */
@MainActor
@Observable
final class LinkInbox {
    static let shared = LinkInbox()
    var url: String?
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        Push.configure()
        UNUserNotificationCenter.current().delegate = self
        if Push.available { application.registerForRemoteNotifications() }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        if Push.available { Messaging.messaging().apnsToken = deviceToken }
    }

    /** Shown while the app is open too, as on Android. */
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        if let url = response.notification.request.content.userInfo["url"] as? String {
            await MainActor.run { LinkInbox.shared.url = url }
        }
    }
}

/** Where a notification's web address leads in the app (the server sends the web app's paths). */
enum Links {
    static func target(_ url: String) -> Target {
        let parts = url.split(separator: "?", maxSplits: 1).map(String.init)
        let path = parts[0]
        var query: [String: String] = [:]
        if parts.count > 1 {
            for pair in parts[1].split(separator: "&") {
                let kv = pair.split(separator: "=", maxSplits: 1).map(String.init)
                if kv.count == 2 { query[kv[0]] = kv[1].removingPercentEncoding ?? kv[1] }
            }
        }
        if path == "/einkauf" { return Target(tab: .einkauf, listId: query["liste"]) }
        if path == "/kalender/geburtstage" { return Target(tab: .kalender, birthdays: true) }
        if path.hasPrefix("/kalender") { return Target(tab: .kalender, date: query["tag"].flatMap(Day.init).map { $0.at(Clock(12, 0)) }) }
        if path.hasPrefix("/todos") { return Target(tab: .todos) }
        if path.hasPrefix("/essen") { return Target(tab: .essen) }
        if path.hasPrefix("/mehr") { return Target(tab: .start, more: true) }
        if path.hasPrefix("/dokumente") {
            let id = path.dropFirst("/dokumente".count).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            return Target(tab: .start, documents: true, documentId: id.isEmpty ? nil : id)
        }
        return Target(tab: .start)
    }
}
