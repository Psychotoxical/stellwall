# Colour worlds, one table for web and Android: writes web/src/theme/worlds.css and
# android/app/src/main/java/app/stellwall/theme/Worlds.kt. Run from the repo root: python scripts/make-worlds.py
WORLDS = [("salbei", 155, 30), ("flieder", 300, 30), ("pfirsich", 50, 200), ("himmel", 235, 30), ("rose", 355, 75), ("sonne", 85, 25), ("pink", 5, 75)]
# Worlds with stronger colour than the calm default: the ground itself is coloured (pink: a candy pink, oklch 87% 0.067 5).
VIVID = {"pink"}
# Worlds with fixed colours instead of computed ones. Psysonic: Catppuccin Latte (light) and Mocha (dark),
# accent Mauve, as in the Psy apps (values from psytags/ui/theme.py and the Catppuccin palette).
FIXED = {
    "psysonic": {
        "light": {
            # Base as the ground keeps Latte's text above 7:1; cards a touch lighter than Base.
            "ground": "#eff1f5", "surface": "#f9fafc", "field": "#e6e9ef", "rule": "#ccd0da",
            "ink": "#4c4f69", "ink-soft": "#5c5f77",
            "board": "#1e1e2e", "board-ink": "#cdd6f4", "board-soft": "#a6adc8", "board-rule": "#45475a",
            "change": "#df8e1d", "change-soft": "#f6e6c8", "change-ink": "#4c4f69",
            "primary": "#8839ef", "primary-ink": "#eff1f5", "accent": "#cba6f7",
        },
        "dark": {
            "ground": "#181825", "surface": "#1e1e2e", "field": "#313244", "rule": "#45475a",
            "ink": "#cdd6f4", "ink-soft": "#a6adc8",
            "board": "#11111b", "board-ink": "#cdd6f4", "board-soft": "#a6adc8", "board-rule": "#313244",
            "change": "#f9e2af", "change-soft": "#4a4030", "change-ink": "#1e1e2e",
            "primary": "#cba6f7", "primary-ink": "#1e1e2e", "accent": "#b4befe",
        },
    },
}
ALL = [n for n, _, _ in WORLDS] + list(FIXED)


def light_of(name):
    if name in FIXED:
        return FIXED[name]["light"]
    h, s = next((h, s) for n, h, s in WORLDS if n == name)
    return light(h, s, name in VIVID)


def dark_of(name):
    if name in FIXED:
        return FIXED[name]["dark"]
    h, s = next((h, s) for n, h, s in WORLDS if n == name)
    return dark(h, s, name in VIVID)

def o(l, c, h):
    return f"oklch({l}% {c} {h})"

def light(h, s, vivid=False):
    if vivid:
        return {
            "ground": o(89, 0.065, h), "surface": o(97.5, 0.022, h), "field": o(85, 0.075, h), "rule": o(81, 0.07, h),
            "ink": o(26, 0.06, h), "ink-soft": o(41, 0.085, h),
            "board": o(40, 0.15, h), "board-ink": o(98, 0.012, h), "board-soft": o(85, 0.06, h), "board-rule": o(50, 0.13, h),
            "change": o(80, 0.13, s), "change-soft": o(92, 0.05, s), "change-ink": o(25, 0.04, s),
            "primary": o(47, 0.18, h), "primary-ink": o(99, 0.005, h), "accent": o(68, 0.19, h),
        }
    return {
        "ground": o(95.5, 0.035, h), "surface": o(99.2, 0.01, h), "field": o(92.5, 0.04, h), "rule": o(89, 0.03, h),
        "ink": o(27, 0.035, h), "ink-soft": o(45, 0.045, h),
        "board": o(34, 0.075, h), "board-ink": o(98, 0.01, h), "board-soft": o(82, 0.04, h), "board-rule": o(44, 0.07, h),
        "change": o(80, 0.13, s), "change-soft": o(92, 0.05, s), "change-ink": o(25, 0.04, s),
        "primary": o(44, 0.12, h), "primary-ink": o(99, 0.005, h), "accent": o(70, 0.14, h),
    }

def dark(h, s, vivid=False):
    if vivid:
        return {
            "ground": o(22, 0.07, h), "surface": o(27, 0.075, h), "field": o(31, 0.08, h), "rule": o(36, 0.075, h),
            "ink": o(95, 0.02, h), "ink-soft": o(79, 0.05, h),
            "board": o(16, 0.07, h), "board-ink": o(96, 0.015, h), "board-soft": o(76, 0.05, h), "board-rule": o(30, 0.06, h),
            "change": o(80, 0.12, s), "change-soft": o(34, 0.06, s), "change-ink": o(20, 0.03, s),
            "primary": o(82, 0.13, h), "primary-ink": o(20, 0.04, h), "accent": o(76, 0.16, h),
        }
    return {
        "ground": o(21, 0.045, h), "surface": o(26, 0.05, h), "field": o(30, 0.055, h), "rule": o(34, 0.05, h),
        "ink": o(94, 0.015, h), "ink-soft": o(77, 0.03, h),
        "board": o(15, 0.05, h), "board-ink": o(95, 0.012, h), "board-soft": o(74, 0.03, h), "board-rule": o(28, 0.04, h),
        "change": o(80, 0.12, s), "change-soft": o(34, 0.06, s), "change-ink": o(20, 0.03, s),
        "primary": o(80, 0.11, h), "primary-ink": o(20, 0.03, h), "accent": o(75, 0.12, h),
    }

def block(sel, vals, scheme):
    lines = [f"{sel} {{"] + [f"  --{k}: {v};" for k, v in vals.items()] + [f"  color-scheme: {scheme};", "}"]
    return "\n".join(lines)

out = ["/* Colour worlds: each person picks one, the whole app takes it on (generated, see DESIGN.md). */", ""]
for name in ALL:
    out.append(block(f':root[data-world="{name}"]', light_of(name), "light"))
    out.append("@media (prefers-color-scheme: dark) {")
    out.append("  " + block(f':root[data-world="{name}"]:not([data-theme="light"])', dark_of(name), "dark").replace("\n", "\n  "))
    out.append("}")
    out.append(block(f':root[data-world="{name}"][data-theme="dark"]', dark_of(name), "dark"))
    out.append("")
open("web/src/theme/worlds.css", "w", encoding="utf-8", newline="\n").write("\n".join(out))


def kt_color(v):
    if v.startswith("#"):
        return f"Color(0xFF{v[1:].upper()})"
    l, c, h = v[len("oklch("):-1].replace("%", "").split()
    return f"oklch({float(l) / 100:.4f}f, {c}f, {h}f)"


def kt_name(k):
    parts = k.split("-")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def pal(vals):
    return "Palette(" + ", ".join(f"{kt_name(k)} = {kt_color(v)}" for k, v in vals.items()) + ")"


kt = ["// Generated by scripts/make-worlds.py from the same table as web/src/theme/worlds.css. Do not edit.", "package app.stellwall.theme", "", "import androidx.compose.ui.graphics.Color", ""]
kt.append("val WORLDS: Map<String, WorldPalettes> = mapOf(")
for name in ALL:
    kt.append(f'    "{name}" to WorldPalettes(light = {pal(light_of(name))}, dark = {pal(dark_of(name))}),')
kt.append(")")
import os
os.makedirs("android/app/src/main/java/app/stellwall/theme", exist_ok=True)
open("android/app/src/main/java/app/stellwall/theme/Worlds.kt", "w", encoding="utf-8", newline="\n").write("\n".join(kt) + "\n")


def swift_color(v):
    if v.startswith("#"):
        r, g, b = (int(v[i:i + 2], 16) / 255 for i in (1, 3, 5))
        return f"RGB(r: {r:.4f}, g: {g:.4f}, b: {b:.4f})"
    l, c, h = v[len("oklch("):-1].replace("%", "").split()
    return f"oklch({float(l) / 100:.4f}, {c}, {h})"


def swift_pal(vals):
    return "Palette(" + ", ".join(f"{kt_name(k)}: {swift_color(v)}" for k, v in vals.items()) + ")"


sw = ["// Generated by scripts/make-worlds.py from the same table as web/src/theme/worlds.css. Do not edit.", "", "let WORLD_KEYS = [" + ", ".join(f'"{n}"' for n in ALL) + "]", "", "let WORLDS: [String: WorldPalettes] = ["]
for name in ALL:
    sw.append(f'    "{name}": WorldPalettes(light: {swift_pal(light_of(name))}, dark: {swift_pal(dark_of(name))}),')
sw.append("]")
os.makedirs("ios/Stellwall/Theme", exist_ok=True)
open("ios/Stellwall/Theme/Worlds.swift", "w", encoding="utf-8", newline="\n").write("\n".join(sw) + "\n")
print("ok")
