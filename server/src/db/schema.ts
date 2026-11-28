import { sql } from "drizzle-orm";
import { bigint, boolean, customType, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull(),
  color: text("color").notNull(),
  world: text("world"),
  passwordHash: text("password_hash").notNull(),
  /** Set when the administration chose the password; the member picks an own one after signing in. */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

export const lists = pgTable("lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  everyone: boolean("everyone").notNull().default(true),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  position: integer("position").notNull().default(0),
});

export const listMembers = pgTable(
  "list_members",
  {
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.listId, t.memberId] })],
);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    key: text("key").notNull(),
    quantity: text("quantity").notNull().default(""),
    category: text("category").notNull(),
    addedBy: uuid("added_by")
      .notNull()
      .references(() => members.id),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    checkedBy: uuid("checked_by").references(() => members.id),
  },
  (t) => [index("items_list_key").on(t.listId, t.key)],
);

/** scope is "family" or a member id: what a private list teaches stays with its owner. */
export const catalogEntries = pgTable(
  "catalog_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind", { enum: ["shopping", "todo"] }).notNull().default("shopping"),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    uses: integer("uses").notNull().default(1),
    lastUsed: timestamp("last_used", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("catalog_kind_scope_key").on(t.kind, t.scope, t.key)],
);

export const boardSeen = pgTable("board_seen", {
  memberId: uuid("member_id")
    .primaryKey()
    .references(() => members.id, { onDelete: "cascade" }),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
});

/** Lines on the board one member ticked off as seen; "all seen" moves boardSeen and clears these. */
export const boardDismissed = pgTable(
  "board_dismissed",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.key] })],
);

export const todos = pgTable("todos", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  key: text("key").notNull(),
  everyone: boolean("everyone").notNull().default(true),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  ruleChangedAt: timestamp("rule_changed_at", { withTimezone: true }).notNull(),
  startDate: date("start_date"),
  time: text("time"),
  recurrence: jsonb("recurrence").notNull(),
  until: date("until"),
  needsConfirm: boolean("needs_confirm").notNull().default(false),
  reminders: jsonb("reminders").notNull().default([]),
});

export const todoMembers = pgTable(
  "todo_members",
  {
    todoId: uuid("todo_id").notNull().references(() => todos.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.todoId, t.memberId] })],
);

export const todoAssignees = pgTable(
  "todo_assignees",
  {
    todoId: uuid("todo_id").notNull().references(() => todos.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    assignedBy: uuid("assigned_by").notNull().references(() => members.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.todoId, t.memberId] })],
);

export const todoDone = pgTable(
  "todo_done",
  {
    todoId: uuid("todo_id").notNull().references(() => todos.id, { onDelete: "cascade" }),
    occurrenceDate: date("occurrence_date").notNull(),
    doneBy: uuid("done_by").notNull().references(() => members.id),
    doneAt: timestamp("done_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.todoId, t.occurrenceDate] })],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    location: text("location").notNull().default(""),
    notes: text("notes").notNull().default(""),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    tz: text("tz").notNull(),
    rrule: text("rrule"),
    everyone: boolean("everyone").notNull().default(false),
    createdBy: uuid("created_by").notNull().references(() => members.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    importUid: text("import_uid"),
    importOwner: uuid("import_owner").references(() => members.id),
    reminders: jsonb("reminders").notNull().default([]),
  },
  (t) => [uniqueIndex("events_import").on(t.importOwner, t.importUid)],
);

export const eventMembers = pgTable(
  "event_members",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.memberId] })],
);

export const eventFor = pgTable(
  "event_for",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    addedBy: uuid("added_by").notNull().references(() => members.id),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.memberId] })],
);

export const eventExceptions = pgTable(
  "event_exceptions",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    occurrenceDate: date("occurrence_date").notNull(),
    cancelled: boolean("cancelled").notNull().default(false),
    title: text("title"),
    location: text("location"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.occurrenceDate] })],
);

export const birthdays = pgTable("birthdays", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  month: integer("month").notNull(),
  day: integer("day").notNull(),
  year: integer("year"),
  everyone: boolean("everyone").notNull().default(true),
  createdBy: uuid("created_by").notNull().references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  remindDays: integer("remind_days").notNull().default(1),
  remindWho: jsonb("remind_who").notNull().default([]),
});

export const birthdayMembers = pgTable(
  "birthday_members",
  {
    birthdayId: uuid("birthday_id").notNull().references(() => birthdays.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.birthdayId, t.memberId] })],
);

/** Settings the administration keeps, such as the Mealie connection. Values never leave the server unasked. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One lunch per day: a Mealie recipe or a free text. */
export const mealPlan = pgTable("meal_plan", {
  date: date("date", { mode: "string" }).primaryKey(),
  recipeId: text("recipe_id"),
  recipeSlug: text("recipe_slug"),
  recipeName: text("recipe_name"),
  text: text("text"),
  cookId: uuid("cook_id").references(() => members.id, { onDelete: "set null" }),
  servings: integer("servings").notNull().default(4),
  updatedBy: uuid("updated_by")
    .notNull()
    .references(() => members.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/** What a household usually has at home; asked about instead of bought by default. */
export const pantryStaples = pgTable("pantry_staples", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  variants: jsonb("variants").$type<string[]>().notNull().default([]),
});

/** A device that receives push messages for a member. */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  label: text("label").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

/** What a member switched off; a missing row means on. */
export const notificationPrefs = pgTable(
  "notification_prefs",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    enabled: boolean("enabled").notNull(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.kind] })],
);

/** The outbox: every message waits here until it is due, then is checked again and sent. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    refType: text("ref_type").notNull(),
    refId: text("ref_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url").notNull(),
    count: integer("count").notNull().default(1),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    dedupe: text("dedupe"),
  },
  (t) => [uniqueIndex("notifications_dedupe").on(t.memberId, t.dedupe), index("notifications_due").on(t.sentAt, t.dueAt)],
);

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/** A document; its file lies encrypted in DOCS_DIR under its id. */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    category: text("category"),
    validUntil: date("valid_until"),
    remindDays: integer("remind_days").notNull().default(30),
    everyone: boolean("everyone").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => members.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    mime: text("mime").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    pages: integer("pages"),
    ocrState: text("ocr_state", { enum: ["pending", "done", "failed"] }).notNull().default("pending"),
    ocrTries: integer("ocr_tries").notNull().default(0),
    text: text("text"),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('german', coalesce(name, '')), 'A') || setweight(to_tsvector('german', coalesce(category, '')), 'B') || setweight(to_tsvector('german', coalesce(text, '')), 'C')`,
    ),
    /** The words as written, for prefixes while typing ("Versicheru" is past the German stem "versicher"). */
    searchPlain: tsvector("search_plain").generatedAlwaysAs(sql`to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(category, '') || ' ' || coalesce(text, ''))`),
  },
  (t) => [index("documents_search_idx").using("gin", t.search), index("documents_search_plain_idx").using("gin", t.searchPlain)],
);

export const documentMembers = pgTable(
  "document_members",
  {
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.memberId] })],
);
