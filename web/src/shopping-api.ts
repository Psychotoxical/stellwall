import { useQuery } from "@tanstack/react-query";
import type { MemberDto } from "@stellwall/shared";
import { api } from "./api.ts";

export type Visibility = { everyone: boolean; memberIds: string[] };
export type ListDto = { id: string; name: string; visibility: Visibility; createdBy: string; openCount: number };
export type ItemDto = {
  id: string;
  listId: string;
  name: string;
  quantity: string;
  category: string;
  addedBy: string;
  addedAt: string;
  checkedAt: string | null;
  checkedBy: string | null;
};
export type ShoppingBoardRow = { kind: "shopping"; who: string; whoName: string; listId: string; listName: string; count: number; latestAt: string; itemIds: string[] };
export type TodoBoardRow = { kind: "todo"; who: string; whoName: string; todoId: string; title: string; latestAt: string };
export type EventBoardRow = { kind: "event"; who: string; whoName: string; eventId: string; title: string; start: string; allDay: boolean; latestAt: string };
export type BoardRow = ShoppingBoardRow | TodoBoardRow | EventBoardRow;
export type Recurrence = { kind: "none" } | { kind: "daily" } | { kind: "weekly"; weekdays: number[] } | { kind: "monthly"; day: number };
export type OccurrenceDto = {
  todoId: string; title: string; date: string | null; at: string | null; overdue: boolean;
  done: { by: string; at: string } | null; assignees: string[]; needsConfirm: boolean; everyone: boolean; createdBy: string;
};
export type TodoRule = {
  id: string; title: string; visibility: Visibility; createdBy: string; assignees: string[]; startDate: string | null;
  time: string | null; recurrence: Recurrence; until: string | null; needsConfirm: boolean; reminders: number[];
};
/** learned: typed in by the family, so it can be forgotten again. */
export type Suggestion = { name: string; category: string; learned?: boolean };

export const useLists = () => useQuery({ queryKey: ["lists"], queryFn: () => api<ListDto[]>("/api/lists") });
export const useItems = (listId: string | undefined) =>
  useQuery({ queryKey: ["items", listId], queryFn: () => api<ItemDto[]>(`/api/lists/${listId}/items`), enabled: !!listId });
export const useBoard = () => useQuery({ queryKey: ["board"], queryFn: () => api<BoardRow[]>("/api/board") });
export const useMembers = () => useQuery({ queryKey: ["members"], queryFn: () => api<MemberDto[]>("/api/members") });
export const useTodos = (view: "today" | "upcoming" | "undated", mine: boolean) =>
  useQuery({ queryKey: ["todos", view, mine], queryFn: () => api<OccurrenceDto[]>(`/api/todos?view=${view}${mine ? "&mine=1" : ""}`) });
