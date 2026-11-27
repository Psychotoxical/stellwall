import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "./api.ts";
import type { Visibility } from "./shopping-api.ts";

export type DocumentDto = {
  id: string;
  name: string;
  category: string | null;
  validUntil: string | null;
  remindDays: 7 | 30 | 90;
  visibility: Visibility;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  mime: string;
  size: number;
  pages: number | null;
  ocr: "pending" | "done" | "failed";
  snippet?: string;
};

export type DocumentMeta = { name: string; category: string | null; validUntil: string | null; remindDays: number; visibility: Visibility };

export const MAX_BYTES = 30 * 1024 * 1024;

export function useDocuments(q: string, category: string | null) {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (category) params.set("category", category);
  return useQuery({ queryKey: ["documents", q.trim(), category], queryFn: () => api<DocumentDto[]>(`/api/documents?${params}`), retry: false });
}

export function useDocument(id: string) {
  return useQuery({ queryKey: ["documents", "one", id], queryFn: () => api<DocumentDto>(`/api/documents/${id}`), retry: false });
}

export function useCategories() {
  return useQuery({ queryKey: ["documents", "categories"], queryFn: () => api<string[]>("/api/document-categories") });
}

export const fileUrl = (id: string, download = false) => `/api/documents/${id}/file${download ? "?download=1" : ""}`;

/** Sends the file with its details; errors come back as ApiError like every other call. */
export async function uploadDocument(file: File, meta: DocumentMeta): Promise<DocumentDto> {
  const body = new FormData();
  body.append("meta", JSON.stringify(meta));
  body.append("file", file);
  let res: Response;
  try {
    res = await fetch("/api/documents", { method: "POST", headers: { "x-stellwall": "1" }, credentials: "same-origin", body });
  } catch {
    throw new ApiError(0, "network");
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new ApiError(res.status, typeof data.error === "string" ? data.error : "error", data);
  return data as DocumentDto;
}

/** "Hausrat 2026.pdf" → "Hausrat 2026". */
export const nameFromFile = (file: string) => file.replace(/\.[^.]{1,5}$/, "").replace(/[_]+/g, " ").trim().slice(0, 120);

/** Days until the date, negative when it passed. */
export function daysLeft(validUntil: string, today = new Date()) {
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = validUntil.split("-").map(Number);
  return Math.round((Date.UTC(y!, m! - 1, d!) - t) / 86_400_000);
}
