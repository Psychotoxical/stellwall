import SwiftUI

struct MoreView: View {
    let api: APIClient
    let member: Member
    var webUrl: String? = nil
    @Binding var theme: ThemeChoice
    let onMemberChanged: (Member) -> Void
    let onSignOut: () -> Void
    let onBack: () -> Void
    @State private var account: AccountModel
    @State private var notify: NotifyModel
    @State private var name: String
    @State private var color: String
    @State private var world: String
    @State private var profileNote: String?
    @State private var current = ""
    @State private var next = ""
    @State private var passwordNote: String?
    @State private var testNote: String?
    @State private var allowed = false
    @State private var serverFcm = true
    @Environment(\.palette) private var p
    @Environment(\.openURL) private var openURL

    init(api: APIClient, member: Member, webUrl: String?, theme: Binding<ThemeChoice>, onMemberChanged: @escaping (Member) -> Void, onSignOut: @escaping () -> Void, onBack: @escaping () -> Void) {
        self.api = api
        self.member = member
        self.webUrl = webUrl
        _theme = theme
        self.onMemberChanged = onMemberChanged
        self.onSignOut = onSignOut
        self.onBack = onBack
        _account = State(initialValue: AccountModel(api: api, me: member, onChanged: onMemberChanged))
        _notify = State(initialValue: NotifyModel(api: api))
        _name = State(initialValue: member.displayName)
        _color = State(initialValue: member.color)
        _world = State(initialValue: member.world)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                BackLink(parent: "Start", action: onBack)
                PageHead(title: MoreText.page)
                SectionHead(title: MoreText.profile)
                BoxCard {
                    VStack(alignment: .leading, spacing: 12) {
                        Field(label: MoreText.name, text: $name)
                        Text(MoreText.color).font(.swSmall).foregroundStyle(p.inkSoft.color)
                        HStack(spacing: 12) {
                            ForEach(MoreText.colors, id: \.self) { c in
                                Button { color = c } label: {
                                    Circle().fill(PersonColors.of(c).color).frame(width: 48, height: 48)
                                        .overlay(Circle().stroke(c == color ? p.ink.color : .clear, lineWidth: 3))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(c.replacingOccurrences(of: "person-", with: ""))
                                .accessibilityAddTraits(c == color ? .isSelected : [])
                            }
                        }
                        Text(MoreText.colorHint).font(.swSmall).foregroundStyle(p.inkSoft.color)
                        Text(MoreText.world).font(.swSmall).foregroundStyle(p.inkSoft.color)
                        FlowChips(items: MoreText.worlds.map(\.0), label: { k in MoreText.worlds.first { $0.0 == k }!.1 }, selected: world, dot: { k in Palette.of(world: k, dark: false).primary }) { world = $0 }
                        Text(MoreText.worldHint).font(.swSmall).foregroundStyle(p.inkSoft.color)
                        if let profileNote { Text(profileNote).font(.swBody) }
                        PrimaryButton(MoreText.save) { Task { profileNote = await account.saveProfile(name: name, color: color, world: world) ?? MoreText.saved } }
                    }
                    .padding(14)
                }
                SectionHead(title: MoreText.theme)
                BoxCard {
                    VStack(alignment: .leading, spacing: 8) {
                        FlowChips(items: ThemeChoice.allCases.map(\.rawValue), label: { ThemeChoice(rawValue: $0)!.label }, selected: theme.rawValue, dot: nil) { k in
                            theme = ThemeChoice(rawValue: k)!
                            DevicePrefs().theme = theme
                        }
                        Text(MoreText.themeHint).font(.swSmall).foregroundStyle(p.inkSoft.color)
                    }
                    .padding(14)
                }
                SectionHead(title: MoreText.password)
                BoxCard {
                    VStack(alignment: .leading, spacing: 12) {
                        Field(label: MoreText.current, text: $current, secure: true)
                        Field(label: MoreText.new, text: $next, secure: true, hint: MoreText.hint)
                        if let passwordNote { Text(passwordNote).font(.swBody) }
                        PrimaryButton(MoreText.password, enabled: !current.isEmpty && !next.isEmpty) {
                            Task {
                                let e = await account.changePassword(current: current, next: next)
                                passwordNote = e ?? MoreText.changed
                                if e == nil { current = ""; next = "" }
                            }
                        }
                    }
                    .padding(14)
                }
                SectionHead(title: MoreText.notify)
                BoxCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(MoreText.step1).font(.swSmall).foregroundStyle(p.inkSoft.color)
                        if !Push.available {
                            Text(MoreText.noBuild).font(.swBody)
                        } else if !serverFcm {
                            Text(MoreText.noFcm).font(.swBody)
                        } else if allowed && notify.devices.contains(where: { $0.label == Push.label }) {
                            Text(MoreText.on).font(.swBody)
                        } else {
                            PrimaryButton(MoreText.allow) {
                                Task {
                                    let asked = await Push.ask()
                                    let ok = asked ? true : await Push.allowed()
                                    if ok {
                                        allowed = true
                                        if let t = await Push.token() { await notify.register(token: t, label: Push.label) }
                                    } else {
                                        allowed = false
                                        testNote = MoreText.denied
                                    }
                                }
                            }
                            if testNote == MoreText.denied {
                                GhostButton(MoreText.openSettings) { if let u = URL(string: UIApplication.openSettingsURLString) { openURL(u) } }
                            }
                        }
                        Text(MoreText.step2).font(.swSmall).foregroundStyle(p.inkSoft.color).padding(.top, 6)
                        ForEach(MoreText.kinds, id: \.0) { kind, label in
                            Toggle(label, isOn: Binding(get: { notify.prefs[kind] ?? true }, set: { on in Task { await notify.set(kind, on) } }))
                                .font(.swBody).frame(minHeight: 44)
                        }
                        Text(MoreText.quiet).font(.swSmall).foregroundStyle(p.inkSoft.color)
                        Text(MoreText.step3).font(.swSmall).foregroundStyle(p.inkSoft.color).padding(.top, 6)
                        GhostButton(MoreText.test) { Task { testNote = await notify.test() } }
                        if let testNote, testNote != MoreText.denied { Text(testNote).font(.swBody) }
                        if let e = notify.error { Notice(e) }
                        Text(MoreText.devices).font(.swSmall).foregroundStyle(p.inkSoft.color).padding(.top, 6)
                        if notify.devices.isEmpty { Text(MoreText.noDevices).font(.swBody).foregroundStyle(p.inkSoft.color) }
                        ForEach(notify.devices) { d in
                            HStack {
                                Text(d.label).font(.swBody)
                                Spacer()
                                Button { Task { await notify.remove(d) } } label: { Icons.trash.image.resizable().frame(width: 22, height: 22).frame(width: 44, height: 44) }
                                    .buttonStyle(.plain).accessibilityLabel(MoreText.remove(d.label))
                            }
                        }
                    }
                    .padding(14)
                }
                if member.role == "admin", let webUrl, let u = URL(string: webUrl) {
                    GhostButton(MoreText.admin) { openURL(u) }
                }
                GhostButton(MoreText.logout, action: onSignOut)
                SectionHead(title: MoreText.about)
                Text(MoreText.version(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")).font(.swBody)
                Text(MoreText.licenses).font(.swSmall).foregroundStyle(p.inkSoft.color)
            }
            .padding(16)
        }
        .background(p.ground.color.ignoresSafeArea())
        .task {
            await notify.load()
            allowed = await Push.allowed()
            if let info = try? await api.appInfo() { serverFcm = info.fcm }
        }
    }
}

/** Round choice chips that wrap onto the next line. */
struct FlowChips: View {
    let items: [String]
    let label: (String) -> String
    let selected: String
    let dot: ((String) -> RGB)?
    let pick: (String) -> Void
    @Environment(\.palette) private var p

    var body: some View {
        WrapLayout(spacing: 8) {
            ForEach(items, id: \.self) { k in
                Button { pick(k) } label: {
                    HStack(spacing: 8) {
                        if let dot { Circle().fill(dot(k).color).frame(width: 18, height: 18) }
                        Text(label(k)).font(.swLabel).foregroundStyle(p.ink.color)
                    }
                    .padding(.horizontal, 12).frame(minHeight: 44)
                    .background((k == selected ? p.surface : p.field).color, in: Capsule())
                    .overlay(Capsule().stroke((k == selected ? p.primary : p.rule).color, lineWidth: k == selected ? 2 : 1))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(k == selected ? .isSelected : [])
            }
        }
    }
}

/** Lays children out in rows, wrapping when the width is used up. */
struct WrapLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, widest: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width { x = 0; y += row + spacing; row = 0 }
            x += size.width + spacing
            row = max(row, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: min(widest, width), height: y + row)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX { x = bounds.minX; y += row + spacing; row = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            row = max(row, size.height)
        }
    }
}
