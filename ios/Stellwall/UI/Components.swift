import SwiftUI

/** Page title with an optional line above it, as the web app's header. */
struct PageHead: View {
    let title: String
    var sub: String? = nil
    @Environment(\.palette) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let sub { Text(sub).font(.swBody).foregroundStyle(p.inkSoft.color) }
            Text(title).font(.swTitle).foregroundStyle(p.ink.color).accessibilityAddTraits(.isHeader)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 14)
    }
}

struct SectionHead: View {
    let title: String
    var aside: String? = nil
    @Environment(\.palette) private var p

    var body: some View {
        HStack(alignment: .lastTextBaseline) {
            Text(title).font(.swHead).foregroundStyle(p.ink.color).accessibilityAddTraits(.isHeader)
            Spacer()
            if let aside { Text(aside).font(.swSmall).foregroundStyle(p.inkSoft.color) }
        }
        .padding(.top, 22).padding(.bottom, 10)
    }
}

/** A card with rows separated by thin lines. */
struct BoxCard<Content: View>: View {
    @ViewBuilder let content: Content
    @Environment(\.palette) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.surface.color, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(p.rule.color, lineWidth: 1))
    }
}

struct RowDivider: View {
    @Environment(\.palette) private var p
    var body: some View { Rectangle().fill(p.rule.color).frame(height: 1) }
}

struct PrimaryButton: View {
    let text: String
    var enabled = true
    let action: () -> Void
    @Environment(\.palette) private var p

    init(_ text: String, enabled: Bool = true, action: @escaping () -> Void) {
        self.text = text
        self.enabled = enabled
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(text).font(Fonts.body(17, weight: 700, style: .headline))
                .frame(maxWidth: .infinity, minHeight: 52)
                .foregroundStyle(p.primaryInk.color)
                .background(p.primary.color.opacity(enabled ? 1 : 0.45), in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}

struct GhostButton: View {
    let text: String
    var danger = false
    let action: () -> Void
    @Environment(\.palette) private var p

    init(_ text: String, danger: Bool = false, action: @escaping () -> Void) {
        self.text = text
        self.danger = danger
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(text).font(.swLabel)
                .frame(maxWidth: .infinity, minHeight: 52)
                .foregroundStyle(p.ink.color)
                .background((danger ? p.changeSoft : p.surface).color, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke((danger ? p.changeInk : p.rule).color, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
    }
}

/** "‹ Kalender": back to the page this one belongs to. */
struct BackLink: View {
    let parent: String
    let action: () -> Void
    @Environment(\.palette) private var p

    var body: some View {
        Button(action: action) { Text("‹ \(parent)").font(.swLabel).foregroundStyle(p.ink.color).frame(minHeight: 44) }
            .buttonStyle(.plain)
            .accessibilityLabel("Zurück zu \(parent)")
    }
}

/** An error note: normal ink on the soft change tone, read out when it appears. */
struct Notice: View {
    let text: String
    @Environment(\.palette) private var p

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text).font(.swBody).foregroundStyle(p.ink.color)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(p.changeSoft.color, in: RoundedRectangle(cornerRadius: 12))
            .accessibilityAddTraits(.updatesFrequently)
    }
}

/** A text field in the app's look: label above, surface ground, primary border when focused. */
struct Field: View {
    let label: String
    @Binding var text: String
    var secure = false
    var keyboard: UIKeyboardType = .default
    var capitalization: TextInputAutocapitalization = .sentences
    var hint: String? = nil
    var submit: SubmitLabel = .done
    var onSubmit: () -> Void = {}
    @FocusState private var focused: Bool
    @Environment(\.palette) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.swSmall).foregroundStyle((focused ? p.primary : p.inkSoft).color)
            Group {
                if secure { SecureField("", text: $text) } else { TextField("", text: $text) }
            }
            .font(.swBody)
            .foregroundStyle(p.ink.color)
            .keyboardType(keyboard)
            .textInputAutocapitalization(capitalization)
            .autocorrectionDisabled(secure || keyboard == .URL || capitalization == .never)
            .submitLabel(submit)
            .onSubmit(onSubmit)
            .focused($focused)
            .padding(.horizontal, 14)
            .frame(minHeight: 52)
            .background(p.surface.color, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke((focused ? p.primary : p.rule).color, lineWidth: focused ? 2 : 1))
            .accessibilityLabel(label)
            if let hint { Text(hint).font(.swSmall).foregroundStyle(p.inkSoft.color) }
        }
    }
}

/** A sheet with a title; content scrolls and stays above the keyboard. */
struct SheetBody<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content
    @Environment(\.palette) private var p

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(title).font(.swHead).foregroundStyle(p.ink.color).accessibilityAddTraits(.isHeader)
                content
            }
            .padding(20)
        }
        .background(p.ground.color.ignoresSafeArea())
        .presentationDragIndicator(.visible)
    }
}
