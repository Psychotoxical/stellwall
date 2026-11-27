import SwiftUI

/** The person colours of the web app, the same in light and dark. */
enum PersonColors {
    static let ink = RGB(r: 0x1A / 255.0, g: 0x1F / 255.0, b: 0x29 / 255.0)
    private static let colors: [String: RGB] = [
        "person-mint": RGB(r: 0xA8 / 255.0, g: 0xD8 / 255.0, b: 0xC8 / 255.0),
        "person-lilac": RGB(r: 0xC7 / 255.0, g: 0xC0 / 255.0, b: 0xF0 / 255.0),
        "person-peach": RGB(r: 0xFF / 255.0, g: 0xC9 / 255.0, b: 0xA8 / 255.0),
        "person-sky": RGB(r: 0xA9 / 255.0, g: 0xD3 / 255.0, b: 0xF0 / 255.0),
    ]
    static func of(_ name: String?) -> RGB { colors[name ?? ""] ?? RGB(r: 0xB4 / 255.0, g: 0xBB / 255.0, b: 0xC7 / 255.0) }
}

/** A person's initial on their colour, as the web app's chip. */
struct PersonChip: View {
    let name: String
    let color: String

    var body: some View {
        Text(String(name.prefix(1)).uppercased())
            .font(Fonts.body(13, weight: 700, style: .caption1))
            .foregroundStyle(PersonColors.ink.color)
            .frame(minWidth: 26, minHeight: 22)
            .padding(.horizontal, 4)
            .background(PersonColors.of(color).color, in: RoundedRectangle(cornerRadius: 6))
            .accessibilityLabel(name)
    }
}

/** The Solar icons of the web and Android apps, as template images from the asset catalog. */
enum Icons: String {
    case bell, cake, calendar, cart = "cart_large_2", todos = "checklist_minimalistic", meals = "chef_hat_minimalistic"
    case documents = "document_text", home = "home_smile", dots = "menu_dots", notebook = "notebook_bookmark"
    case settings, trash = "trash_bin_minimalistic", user = "user_rounded", users = "users_group_rounded"

    var image: Image { Image(rawValue).renderingMode(.template) }
}

/** Who sees it, in words: "Alle", "Nur ich" or the names. */
func visibilityLabel(_ v: Visibility, members: [Member], meId: String) -> String {
    if v.everyone { return VisText.all }
    if v.memberIds.allSatisfy({ $0 == meId }) { return VisText.onlyMe }
    return v.memberIds.map { id in members.first { $0.id == id }?.displayName ?? "?" }.joined(separator: ", ")
}

enum VisText {
    static let title = "Wer darf das sehen?"
    static let all = "Alle"
    static let allSub = "Die ganze Familie, auch wer später dazukommt"
    static let onlyMe = "Nur ich"
    static let onlyMeSub = "Niemand sonst sieht es"
    static let some = "Ausgewählte Personen"
    static let someSub = "Nur die, die du anhakst"
    static let you = "(du)"
    static let pickSomeone = "Hak mindestens eine weitere Person an, oder wähle „Nur ich“."
    static func see(_ who: String) -> String { "Sehen: \(who)" }
}

/** "Wer darf das sehen?" for any item; the current member always stays included. */
struct VisibilitySheet: View {
    enum Who { case all, me, some }
    let lead: String
    let members: [Member]
    let meId: String
    var readOnly = false
    let onSave: (Visibility) -> Void
    @State private var who: Who
    @State private var picked: Set<String>
    @State private var error: String?
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss

    init(lead: String, value: Visibility, members: [Member], meId: String, readOnly: Bool = false, onSave: @escaping (Visibility) -> Void) {
        self.lead = lead
        self.members = members
        self.meId = meId
        self.readOnly = readOnly
        self.onSave = onSave
        _who = State(initialValue: value.everyone ? .all : value.memberIds.allSatisfy { $0 == meId } ? .me : .some)
        _picked = State(initialValue: Set(value.memberIds.filter { $0 != meId }))
    }

    var body: some View {
        SheetBody(title: VisText.title) {
            Text(lead).font(.swBody).foregroundStyle(p.inkSoft.color)
            option(.all, VisText.all, VisText.allSub)
            option(.me, VisText.onlyMe, VisText.onlyMeSub)
            option(.some, VisText.some, VisText.someSub)
            if who == .some {
                ForEach(members.filter { $0.id != meId }) { m in
                    Toggle(isOn: Binding(get: { picked.contains(m.id) }, set: { on in if on { picked.insert(m.id) } else { picked.remove(m.id) }; error = nil })) {
                        HStack { PersonChip(name: m.displayName, color: m.color); Text(m.displayName).font(.swBody) }
                    }
                    .disabled(readOnly)
                    .frame(minHeight: 44)
                }
            }
            if let error { Notice(error) }
            if !readOnly {
                PrimaryButton("Speichern") {
                    switch who {
                    case .all: onSave(.all)
                    case .me: onSave(Visibility(everyone: false, memberIds: [meId]))
                    case .some:
                        if picked.isEmpty { error = VisText.pickSomeone; return }
                        onSave(Visibility(everyone: false, memberIds: [meId] + picked.sorted()))
                    }
                    dismiss()
                }
            }
            GhostButton("Abbrechen") { dismiss() }
        }
    }

    private func option(_ w: Who, _ title: String, _ sub: String) -> some View {
        Button { who = w; error = nil } label: {
            HStack(spacing: 12) {
                Image(systemName: who == w ? "largecircle.fill.circle" : "circle").foregroundStyle(p.primary.color)
                VStack(alignment: .leading) {
                    Text(title).font(.swLabel).foregroundStyle(p.ink.color)
                    Text(sub).font(.swSmall).foregroundStyle(p.inkSoft.color)
                }
                Spacer()
            }
            .padding(12)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke((who == w ? p.primary : p.rule).color, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .disabled(readOnly)
        .accessibilityAddTraits(who == w ? .isSelected : [])
    }
}
