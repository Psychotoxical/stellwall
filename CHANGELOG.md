# Changelog

Every version has its own section. The section of a version becomes the text of its release draft. Changes that are not released yet collect under `## [Unreleased]`.

## [Unreleased]

### Added

- iPhone app: Start with today for you, shopping lists, the calendar with series and birthdays, the meal plan with cooking mode and shopping, to-dos, documents with Apple's document scanner, Mehr with profile, colour world, light or dark, password and notifications. Every release uploads it to TestFlight.
- Notifications to iPhones: the server adds an alert for Apple to every message to a phone.

## [0.1.11] - 2026-11-27

### Added

- A new colour world "Pink": a candy pink ground with berry buttons, light and dark.

### Changed

- The image check for text recognition leaves more margin around its test page.

### Fixed

- Choosing who may see something no longer closes the form it was opened from (documents, birthdays, to-dos, shopping lists).

## [0.1.10] - 2026-11-27

### Added

- Documents: upload PDF, JPG or PNG (up to 30 MB) on the web, scan with the phone's document scanner or pick a file in the Android app. Each document has a name, a category, an optional "gültig bis" with a reminder 1 week, 1 month or 3 months before, and who may see it.
- The text of every document is recognized in the background (German and English), so the search finds words inside scans too.
- A notification at 09:00 when a document runs out, with the switch "Ablaufende Dokumente".
- Documents are stored encrypted; the key lives apart from the data (`DOCS_KEY_FILE`, see `deploy/compose.yaml`).
- Members whose password the administration chose pick an own one right after signing in (web and Android); this also applies to accounts that exist already.
- Android app: light, dark or as the system has it, under Mehr → Darstellung.
- Start greets by the time of day: "Guten Morgen", "Guten Mittag", "Guten Tag", "Guten Abend", "Gute Nacht".

## [0.1.9] - 2026-11-27

### Added

- Shopping lists can be emptied at once ("Liste leeren"); the list itself stays.

### Fixed

- Meal plan: a tap on a recipe plans it right away, no more scrolling down to Save.
- Shopping for the meal plan works again after its list was deleted: a new family list "Wocheneinkauf" is made, also when none was chosen yet.

## [0.1.8] - 2026-11-27

### Added

- Android app: sign-in that stays signed in, Start with the board, "Heute für dich" and areas, shopping lists with suggestions, ticking and live updates, the calendar with month, week and upcoming views, events, series and birthdays, the meal plan with recipes, cooking mode and shopping for the week, and to-dos.
- Android app: Mehr with name, colour, colour world and password, notifications through Firebase with a tap opening the right page, and updates from the family server.
- The server sends notifications to Android phones (with a Firebase service account) and offers the newest Android app for download.
- Mehr in the web app links the Android app for a first install on a phone.
- The Android app has its own icon: the four l of the wordmark in the family colours.

## [0.1.7] - 2026-11-26

### Added

- Colour worlds: each person picks Salbei, Flieder, Pfirsich, Himmel, Rosé or Sonne under My account, and the whole app takes it on, light and dark, on all their devices.
- A new round "stellwall" wordmark with the four l in the family colours.
- The meal plan has its own tab; everything else is behind the round picture top right.
- Back buttons on every page below an area.
- Calendar week and upcoming views as a compact agenda: a date column beside the events, empty days as a thin line.

### Fixed

- Shopping list: tick boxes line up whether or not an item has an amount.
- Sheets on the iPhone can no longer be pushed sideways by wide date and time fields.

## [0.1.6] - 2026-11-26

### Added

- Push notifications, switched on per device under More → Notifications; each person chooses what they are told about.
- Events entered or changed for you, to-dos given to you, shopping (bundled after five quiet minutes), being set as cook, and birthdays.
- Reminders for events and to-dos at the set time; birthdays, all-day events and to-dos without a time at 18:00 the evening before.
- Quiet from 22:00 to 7:00; reminders for events still come on time. Nobody is told about anything they cannot see, or about their own changes.
- On an iPhone the page explains how to add Stellwall to the home screen first, which Apple requires for notifications.
- Recipe view: tap an ingredient or step to cross it out while cooking.

### Fixed

- Meal plan: without a search word all recipes are listed, not just the first 24; who cooks and servings sit above the list.
- Mealie connection test shows how many recipes there are in total, not just the first page.

## [0.1.5] - 2026-11-26

### Added

- Meal plan: one lunch per day, either a recipe from Mealie or a free text, with who cooks and how many servings.
- Recipe view with ingredients recalculated for the servings and large steps; the screen stays on while it is open.
- "Buy the week's ingredients": what is needed is ticked, pantry items are asked about, everything goes onto one list chosen by the administration and adds up with what is already there.
- Pantry list that everyone can change, filled with common basics.
- Mealie connection under More (administration only); the key is never shown again after saving.
- More shows the running version, and a bar offers to reload when a new version is ready.

## [0.1.4] - 2026-11-26

### Fixed

- Phones: pages no longer move sideways, forms in sheets scroll in one place, and Save stays visible at the bottom, also with the keyboard open.
- Phones: the tab bar hides while typing, the page behind a sheet stays still, and date fields show the full year on small screens.
- Phones: the shopping field moves up when typing so its suggestions are not hidden by the keyboard.

## [0.1.3] - 2026-11-26

### Added

- Calendar with month, week and "upcoming" views, showing everyone's events or only your own.
- Events: all-day or with times, place and note, who it is for, and whether everyone may see it.
- Repeating events weekly, every two weeks, monthly or yearly; changes apply to this one, this and following, or all.
- Birthdays, also for people outside the family, with the age they turn, a reminder lead time and who gets reminded.
- One-time import of a calendar file from Google or Apple, or a shared calendar link, with a preview first; importing the same file again adds nothing twice.
- The start screen lists today's events and birthdays, and the board shows events others entered for you.

## [0.1.2] - 2026-11-26

### Added

- To-dos: who takes care of it, who may see it, a date and time, and repeating on chosen weekdays, daily or monthly.
- "Must be confirmed": such to-dos are checked off, everyone sees who did it, and missed ones stay on top as overdue.
- Reminder times can be set already; they reach the phone once notifications are ready.
- Suggestions while typing from about 180 household tasks, learning from what you type.
- The start screen shows your to-dos for today, and the board shows to-dos others gave you.

### Fixed

- The sign-in and setup pages start at the top on phones.

## [0.1.1] - 2026-11-26

### Added

- Shopping lists: several lists, each with "who may see this", sorted by store section.
- Suggestions while typing from a catalog of about 1,600 everyday items; items you type yourself are learned (from private lists only for yourself).
- Adding the same item twice merges it and adds up the amounts.
- Changes show up on every device right away.
- Checked items stay visible for the rest of the day and disappear at midnight.
- The start screen board shows what others added since you last looked; new entries are highlighted.

### Security

- Build tools updated to versions without known security issues.

## [0.1.0] - 2026-11-26

### Added

- First setup creates an admin account; members sign in once and stay signed in on each device.
- Admins add, edit and remove family members and reset passwords.
- "My account": name, colour, password, signed-in devices, light and dark mode.
- Start screen with the change board and the six areas that come next.
- Installable as an app on phones and desktops.

### Changed

- Repository cleanup: design notes are no longer part of the source tree.

