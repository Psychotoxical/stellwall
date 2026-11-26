import { z } from "zod";

export type Visibility = { everyone: boolean; memberIds: string[] };

export const visibilitySchema = z
  .object({ everyone: z.boolean(), memberIds: z.array(z.string().min(1)) })
  .refine((v) => new Set(v.memberIds).size === v.memberIds.length, { message: "duplicate member" })
  .refine((v) => v.everyone || v.memberIds.length > 0, { message: "no member selected" });

export function canSee(v: Visibility, userId: string): boolean {
  return v.everyone || v.memberIds.includes(userId);
}
