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
    /** Off for names, addresses and passwords. */
    var autocorrect = true
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
            .autocorrectionDisabled(secure || keyboard == .URL || !autocorrect)
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
struct SheetBody<Content: View, Footer: View>: View {
    let title: String
    @ViewBuilder let content: Content
    /** Save and cancel: they stay at the bottom while a long list scrolls behind them. */
    @ViewBuilder let footer: Footer
    @Environment(\.palette) private var p

    init(title: String, @ViewBuilder content: () -> Content, @ViewBuilder footer: () -> Footer) {
        self.title = title
        self.content = content()
        self.footer = footer()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(title).font(.swHead).foregroundStyle(p.ink.color).accessibilityAddTraits(.isHeader)
                content
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if Footer.self != EmptyView.self {
                VStack(spacing: 10) { footer }
                    .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 8)
                    .background(p.ground.color.ignoresSafeArea(edges: .bottom))
                    .overlay(alignment: .top) { Rectangle().fill(p.rule.color).frame(height: 1) }
            }
        }
        .background(p.ground.color.ignoresSafeArea())
        .presentationDragIndicator(.visible)
    }
}

extension SheetBody where Footer == EmptyView {
    init(title: String, @ViewBuilder content: () -> Content) {
        self.init(title: title, content: content, footer: { EmptyView() })
    }
}


/**
 * Swipe from the left edge to go back, as on any iPhone page with a back button: the page follows the
 * finger and goes when let go past a third of the width or with a quick flick, else it springs back.
 */
struct BackSwipe: ViewModifier {
    let action: () -> Void
    @State private var offset: CGFloat = 0

    func body(content: Content) -> some View {
        GeometryReader { geo in
            content
                .offset(x: offset)
                .overlay(alignment: .leading) {
                    Color.clear
                        .frame(width: 24)
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 10, coordinateSpace: .global)
                                .onChanged { v in offset = max(0, v.translation.width) }
                                .onEnded { v in
                                    let far = v.translation.width > geo.size.width / 3 || v.predictedEndTranslation.width > geo.size.width / 2
                                    if far {
                                        withAnimation(.easeOut(duration: 0.18)) { offset = geo.size.width }
                                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                                            Haptic.tap()
                                            action()
                                            offset = 0
                                        }
                                    } else {
                                        withAnimation(.spring(duration: 0.25)) { offset = 0 }
                                    }
                                }
                        )
                        .accessibilityHidden(true)
                }
        }
    }
}

extension View {
    /** Swipe from the left edge goes back, like the page's back link. */
    func backSwipe(_ action: @escaping () -> Void) -> some View { modifier(BackSwipe(action: action)) }
}

/** The small taps iPhones give when something is done. */
@MainActor
enum Haptic {
    /** A tick, a page left, an item added. */
    static func tap() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    /** Something was removed. */
    static func removed() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
    /** Something worked that took a moment (saved, sent). */
    static func done() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}


/** What a swipe on a row does: its label, symbol, colour, and the action. */
struct SwipeAction {
    let label: String
    let symbol: String
    let danger: Bool
    let action: () -> Void
}

/**
 * Swipe a row as in iOS lists: to the right for the leading action (tick off), to the left for the
 * trailing one (delete). It only takes over when the finger moves clearly sideways, so scrolling stays.
 * Swiped past the threshold, the action runs; the row springs back either way.
 */
struct SwipeRow: ViewModifier {
    let leading: SwipeAction?
    let trailing: SwipeAction?
    @State private var offset: CGFloat = 0
    @State private var sideways: Bool?
    @Environment(\.palette) private var p
    private let reach: CGFloat = 90

    func body(content: Content) -> some View {
        content
            .background(p.surface.color)
            .offset(x: offset)
            .background {
                HStack(spacing: 0) {
                    if offset > 0, let leading { badge(leading, alignment: .leading) }
                    Spacer(minLength: 0)
                    if offset < 0, let trailing { badge(trailing, alignment: .trailing) }
                }
            }
            .clipped()
            .simultaneousGesture(
                DragGesture(minimumDistance: 16)
                    .onChanged { v in
                        if sideways == nil { sideways = abs(v.translation.width) > abs(v.translation.height) * 1.6 }
                        guard sideways == true else { return }
                        let dx = v.translation.width
                        if dx > 0, leading == nil { return }
                        if dx < 0, trailing == nil { return }
                        // Past the threshold the row slows down, so the finger feels where it counts.
                        offset = abs(dx) <= reach ? dx : (dx > 0 ? 1 : -1) * (reach + (abs(dx) - reach) * 0.3)
                    }
                    .onEnded { _ in
                        let run = sideways == true && abs(offset) >= reach
                        let picked = offset > 0 ? leading : trailing
                        sideways = nil
                        withAnimation(.spring(duration: 0.25)) { offset = 0 }
                        if run, let picked {
                            if picked.danger { Haptic.removed() } else { Haptic.tap() }
                            picked.action()
                        }
                    }
            )
            .accessibilityActions {
                if let leading { Button(leading.label, action: leading.action) }
                if let trailing { Button(trailing.label, action: trailing.action) }
            }
    }

    private func badge(_ a: SwipeAction, alignment: Alignment) -> some View {
        let full = abs(offset) >= reach
        return ZStack(alignment: alignment) {
            (a.danger ? p.changeSoft : p.field).color
            Image(systemName: a.symbol).font(.system(size: 20, weight: .semibold))
                .foregroundStyle((a.danger ? p.changeInk : p.primary).color)
                .scaleEffect(full ? 1.15 : 0.9)
                .padding(.horizontal, 22)
        }
        .animation(.spring(duration: 0.2), value: full)
    }
}

extension View {
    /** Swipe right for [leading], left for [trailing], as in iOS lists. */
    func swipeRow(leading: SwipeAction? = nil, trailing: SwipeAction? = nil) -> some View {
        modifier(SwipeRow(leading: leading, trailing: trailing))
    }
}
