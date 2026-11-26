import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull(),
  color: text("color").notNull(),
  passwordHash: text("password_hash").notNull(),
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
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    uses: integer("uses").notNull().default(1),
    lastUsed: timestamp("last_used", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("catalog_scope_key").on(t.scope, t.key)],
);

export const boardSeen = pgTable("board_seen", {
  memberId: uuid("member_id")
    .primaryKey()
    .references(() => members.id, { onDelete: "cascade" }),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
});
