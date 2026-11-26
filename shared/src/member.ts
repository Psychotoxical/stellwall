import { z } from "zod";

export type Role = "admin" | "member";

export type MemberDto = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  color: string;
};

export function normalizeUsername(raw: string): string {
  return raw.normalize("NFC").trim().toLowerCase();
}

export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .pipe(z.string().min(3).max(32).regex(/^[a-z0-9._\-äöüß]+$/));

export const passwordSchema = z.string().min(10).max(200);

export const roleSchema = z.enum(["admin", "member"]);
