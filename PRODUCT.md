# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

One web app for every browser. In a second stage the same app is wrapped in a native shell for Android (installed as APK) and possibly iOS (TestFlight or home-screen web app). The shell adds the system document scanner and system push; the design language stays the web app's own.

## Stack

delegated: the owner leaves the how to the builder. Chosen: TypeScript throughout; web client with React + Vite, installable as PWA; Node server with PostgreSQL; native shells via Capacitor; everything as a Docker Compose stack on the owner's dedicated server behind the existing host nginx + certbot.

## Users

One family of four adults (two parents, two adult children). All four are equal users. Two of them (the parents) also manage members: add, edit, remove people. No children's mode now; it may be added later if grandchildren join.

Devices change over time. Today: iPhone, iPad, three Samsung Galaxy phones; Windows, macOS and Linux desktops with ordinary browsers.

## Product Purpose

A private family organizer that replaces a paid commercial family app the family already uses. It keeps only the parts the family actually needs, without subscription, without features nobody uses, and with data on the family's own server.

Success: the family stops opening the old app because this one does the daily things (shopping list, to-dos, calendar) faster and more clearly.

## Positioning

Built for exactly one family. Every item can be shared with any combination of family members, not only "everyone" or "just me". Recipes come from the family's own Mealie instance. It will never be published or offered to anyone else.

## Operating Context

- Shopping happens in stores with good mobile reception; the app may require a connection.
- Recipes are maintained in a self-hosted Mealie instance and read while cooking on a phone.
- Paper documents get photographed or scanned with a phone; files also come from desktops.
- Calendars currently live in Google Calendar and Apple Calendar; they are imported once per person, not synced.

## Capabilities and Constraints

- Areas: documents, calendar, birthdays, shopping lists, to-dos, meal planner with recipes.
- Visibility on every item: everyone, only me, or any chosen set of members. Calendar entries separate "who it is for" from "who may see it".
- Shopping lists update live for everyone; checked items are visible to all. Typing suggests items from a large grocery catalog.
- To-dos: recurring by weekday, assignable to people, optional "must be confirmed", reminders (for example 1 day, 1 hour, 10 minutes before).
- Documents: phone scan or upload, a name is mandatory, search by name, category and recognized text (OCR on the own server).
- Meal planner: pick a recipe per day from Mealie with search; open and scale recipes in the app; send ingredients to the shopping list, with everyday staples (salt, pepper, onions) offered as "do you have this at home?" instead of pre-selected.
- Notifications: each person chooses what they get; calendar notifications only for entries that concern them; shopping list changes bundled, not per item.
- One login per person, once. No dependency on Nextcloud or Paperless.
- Encrypted transport (HTTPS only); stored files encrypted at rest.
- Out of scope: photo albums, chat, location, budget, address book, offline mode, app store releases.

## Brand Commitments

- Name: Stellwall.
- Look: light and dark mode, friendly and family-like with pastel tones, but professional and with good contrast. Not the owner's other app colors.
- Own family-friendly icons; not the icon set used in the owner's other apps.
- Voice: plain German for adults. Functions are named for what they do. Not childish.

## Evidence on Hand

None yet. No real family names, documents or recipes may appear in the repository, screenshots or examples; use neutral placeholders.

## Product Principles

1. Obvious beats clever: every screen shows what it is for at a glance, and the next action is clear.
2. Private by default: an item reaches only the people it was shared with, and notifications follow the same rule.
3. Fewer, finished features: only what the family uses, done properly.
4. Built to grow: new areas can dock on later without reworking the existing ones.

## Accessibility & Inclusion

Text contrast at least WCAG AA in both themes. Works with one hand on a phone in a store.
