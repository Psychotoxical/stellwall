/** Tells connected devices that something changed; filled in by the live hub. */
export type Notifier = {
  /** Items of this list changed. */
  list(listId: string): void;
  /** The set of lists changed (created, renamed, deleted, visibility). */
  lists(): void;
};

export const silent: Notifier = { list: () => {}, lists: () => {} };
