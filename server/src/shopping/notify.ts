/** Tells connected devices that something changed; filled in by the live hub. */
export type Notifier = {
  /** Items of this list changed. */
  list(listId: string): void;
  /** The set of lists changed (created, renamed, deleted, visibility). */
  lists(): void;
  /** This to-do or its done marks changed. */
  todo(todoId: string): void;
  /** A to-do was deleted; audience is who could see it (null: everyone). */
  todoGone(audience: string[] | null): void;
  /** A calendar event changed. */
  calendar(eventId: string): void;
  /** A birthday changed. */
  birthday(birthdayId: string): void;
  /** An event or birthday was deleted; audience is who could see it (null: everyone). */
  calendarGone(audience: string[] | null): void;
  /** The meal plan changed (it is for everyone). */
  meals(): void;
  /** Push: people were made the ones an event is for, or their event changed. */
  eventFor(eventId: string, memberIds: string[], actor: Actor, changed: boolean, date?: string): void;
  /** Push: people were given a to-do. */
  todoGiven(todoId: string, memberIds: string[], actor: Actor): void;
  /** Push: someone put things on a list (bundled). */
  itemsAdded(listId: string, actor: Actor, count: number): void;
  /** Push: someone was set as cook for a day. */
  cook(date: string, cookId: string, actor: Actor): void;
};

export type Actor = { id: string; displayName: string };

/** The part the live hub fills in: hints to open pages. */
export type LiveNotifier = Omit<Notifier, "eventFor" | "todoGiven" | "itemsAdded" | "cook">;

export const silent: Notifier = { list: () => {}, lists: () => {}, todo: () => {}, todoGone: () => {}, calendar: () => {}, birthday: () => {}, calendarGone: () => {}, meals: () => {}, eventFor: () => {}, todoGiven: () => {}, itemsAdded: () => {}, cook: () => {} };
