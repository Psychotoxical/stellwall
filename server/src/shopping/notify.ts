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
};

export const silent: Notifier = { list: () => {}, lists: () => {}, todo: () => {}, todoGone: () => {} };
