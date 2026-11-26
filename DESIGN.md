---
name: Stellwall
description: A private family organizer whose start screen is a family departure board.
colors:
  ground: "#F4F6F8"
  surface: "#FFFFFF"
  ink: "#1A1F29"
  ink-soft: "#586070"
  rule: "#E3E7EC"
  field: "#EEF1F4"
  board: "#1A1F29"
  board-ink: "#FFFFFF"
  board-soft: "#B4BBC7"
  board-rule: "#2E3543"
  change: "#FF8B6B"
  change-soft: "#FFE3D9"
  person-mint: "#A8D8C8"
  person-lilac: "#C7C0F0"
  person-peach: "#FFC9A8"
  person-sky: "#A9D3F0"
  dark-ground: "#12151C"
  dark-surface: "#1B2029"
  dark-ink: "#E9ECF2"
  dark-ink-soft: "#A4ABB9"
  dark-rule: "#2A303C"
  dark-field: "#232936"
  dark-board: "#0B0D12"
  dark-board-rule: "#262C38"
  dark-change: "#FF9A7D"
  dark-change-soft: "#4A2C24"
typography:
  headline:
    fontFamily: "Sofia Sans Condensed, Sofia Sans, Segoe UI, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Sofia Sans Condensed, Sofia Sans, Segoe UI, sans-serif"
    fontSize: "21px"
    fontWeight: 800
    lineHeight: 1.2
  board-time:
    fontFamily: "Sofia Sans Condensed, Sofia Sans, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    fontFeature: "tnum"
  body:
    fontFamily: "Sofia Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  body-strong:
    fontFamily: "Sofia Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
  label:
    fontFamily: "Sofia Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  tag:
    fontFamily: "Sofia Sans Condensed, Sofia Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 800
    letterSpacing: "0.03em"
rounded:
  sm: "8px"
  md: "14px"
  sheet: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "26px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "48px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "48px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "13px 14px"
  tag-change:
    backgroundColor: "{colors.change}"
    textColor: "{colors.ink}"
    typography: "{typography.tag}"
    rounded: "6px"
    padding: "4px 8px"
  person-chip:
    backgroundColor: "{colors.person-mint}"
    textColor: "{colors.ink}"
    rounded: "6px"
    height: "22px"
  board:
    backgroundColor: "{colors.board}"
    textColor: "{colors.board-ink}"
    rounded: "{rounded.md}"
    padding: "14px 16px 6px"
---

# Design System: Stellwall

## Overview

**Creative North Star: "The Family Departure Board"**

Stellwall reads like the board in a station hall: one dark plate tells everyone what changed, rows sit in a fixed rhythm, times line up in tabular figures. Around that plate the app stays cool, light and calm, so the board is the one thing that speaks loudly. The family warmth comes from the people themselves: each member owns a pastel colour, and those colours mark who an item is for.

Density is moderate and phone-first: rows are tall enough to tick off with a thumb in a store, text is plain German for adults. On desktop the same rows spread into two working columns beside a side rail.

**Key Characteristics:**
- One ink-dark board plate on a cool light ground.
- Coral means "changed since you looked" and nothing else.
- Pastel person colours carry ownership and visibility.
- Condensed heavy type for headings, times and tags; regular Sofia Sans for everything read.
- Segmented rows split by fine rules, like a boarding pass.

## Colors

A cool neutral ground, one dark plate, one signal colour, four person pastels.

### Primary
- **Board Ink** (board): the "Seit du zuletzt hier warst" plate and the primary button. In dark mode it becomes Night Plate (dark-board), darker than the ground so the plate still reads as the plate.

### Secondary
- **Signal Coral** (change): tags and tints for changed items. Always with dark ink text on it, never as text on a light ground.
- **Coral Wash** (change-soft): background of a changed list row until it has been seen.

### Tertiary
- **Person colours** (person-mint, person-lilac, person-peach, person-sky): one per family member, used for person chips, avatar, and later the calendar. Text on them is always ink.

### Neutral
- **Cool Ground** (ground): page background.
- **Paper White** (surface): lists, sheets, tab bar.
- **Ink** (ink) and **Soft Ink** (ink-soft): text and secondary text.
- **Rule** (rule): row dividers and borders. **Field** (field): hover and selected backgrounds.

### Named Rules
**The Signal Rule.** Coral appears only on things that changed and have not been seen. Once seen, the row settles in place and the coral fades out.

**The Person Colour Rule.** Person pastels mark people, never areas or states.

## Typography

**Display Font:** Sofia Sans Condensed (with Sofia Sans, Segoe UI)
**Body Font:** Sofia Sans (with Segoe UI, system-ui)

**Character:** The condensed heavy cut is the board's voice: headings, times, quantities and tags. The regular cut does all reading. One family keeps the two voices related.

### Hierarchy
- **Headline** (800, 30px, 1.1): screen title like "Hallo Alex" or "Supermarkt".
- **Title** (800, 21px): section heads like "Heute".
- **Board time** (800, 18px, tabular): times and quantities in rows.
- **Body** (400 and 600, 16px, 1.45): row text and controls.
- **Label** (400, 14px): second line in rows, hints.
- **Tag** (800, 13px, 0.03em, uppercase): status tags on the board only.

### Named Rules
**The Board Voice Rule.** Uppercase lives only inside board tags. Headings and labels stay sentence case.

## Layout

Phone first: header with date and greeting, content, fixed tab bar with five tabs (Start, Einkauf, Kalender, To-dos, Mehr) and a 4px indicator under the current tab. Side gutters 16px at least. From 900px a 220px side rail replaces the tab bar, content max 1180px, start screen in two columns (board left, today and list right). Rows: 10–13px vertical padding, 12–14px horizontal. Section heads get 26px above, 10px below.

## Elevation & Depth

Flat. Depth comes from the dark board plate and from borders. The only shadow is under the suggestion dropdown (`0 8px 24px -8px rgb(0 0 0 / .25)`), the only scrim is behind sheets.

## Shapes

Gently rounded: 14px for plates and boxes, 8px for buttons, inputs and checkboxes, 6px for chips and tags, 18px for sheet tops. Checkbox targets are 44px squares around a 26px box.

## Components

### Buttons
- **Primary:** ink background, white text, 48px tall, 8px radius.
- **Ghost:** transparent with a 1.5px rule border.
- **Focus:** 2px outline in primary, 2px offset.

### Chips
- **Person chip:** 22px high, the person's pastel, first letter in ink.
- **Visibility pill:** "Sehen: Alle" with people icon, opens the sheet.

### Inputs / Fields
- **Style:** 1.5px rule border on white, 17px text, 8px radius; border turns ink on focus.
- **Suggestions:** dropdown under the field, one row per item with its store section on the right; arrow keys and Enter work.

### Navigation
- **Tab bar:** icon above label, current tab in ink with coral indicator. **Rail:** same entries, current one on Field background.

### Icons
- **Set:** Solar, Bold Duotone style (480 Design, CC BY 4.0), loaded at build time from `@iconify-json/solar`. Both layers take `currentColor`; the second layer keeps its built-in reduced opacity.
- **Area icons:** Dokumente `document-text`, Kalender `calendar`, Geburtstage `cake`, Einkauf `cart-large-2`, To-dos `checklist-minimalistic`, Essensplan `chef-hat-minimalistic`; tab bar adds Start `home-smile` and Mehr `menu-dots` (all `-bold-duotone`).
- **Sizes:** 24px in tab bar and rail, 40px on larger surfaces.
- **Attribution:** "Icons: Solar by 480 Design, CC BY 4.0" under Mehr → Über Stellwall.
- **App icon:** own drawing in `design/icons/app-icon.svg` (dark board with three rows and coral, mint, lilac tags).

### Departure Board (signature)
Dark plate, title "Seit du zuletzt hier warst", count on the right, rows of time, what plus area, tag. Tapping a row marks it seen: the tag fades from coral to soft text in 450ms (ease-out), the row does not move, then the area opens.

### Sheet "Wer darf das sehen?"
Bottom sheet on phone, centred dialog on desktop. Options Alle, Nur ich, Ausgewählte Personen; the current user is always included and cannot be unticked.

## Do's and Don'ts

### Do:
- **Do** keep one board plate per screen.
- **Do** show times and quantities in tabular figures.
- **Do** put the person chips at the right end of a row.

### Don't:
- **Don't** use coral for buttons, links or decoration.
- **Don't** use person pastels for areas or states.
- **Don't** build the start screen as a grid of same-size area tiles.
