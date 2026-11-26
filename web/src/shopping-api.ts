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
export type BoardRow = { who: string; whoName: string; listId: string; listName: string; count: number; latestAt: string; itemIds: string[] };
export type Suggestion = { name: string; category: string };

export const useLists = () => useQuery({ queryKey: ["lists"], queryFn: () => api<ListDto[]>("/api/lists") });
export const useItems = (listId: string | undefined) =>
  useQuery({ queryKey: ["items", listId], queryFn: () => api<ItemDto[]>(`/api/lists/${listId}/items`), enabled: !!listId });
export const useBoard = () => useQuery({ queryKey: ["board"], queryFn: () => api<BoardRow[]>("/api/board") });
export const useMembers = () => useQuery({ queryKey: ["members"], queryFn: () => api<MemberDto[]>("/api/members") });
