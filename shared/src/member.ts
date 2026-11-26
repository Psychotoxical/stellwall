import { z } from "zod";

export type Role = "admin" | "member";

export type MemberDto = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  color: string;
  /** The colour world the app takes on for this person. */
  world: World;
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

export const PERSON_COLORS = ["person-mint", "person-lilac", "person-peach", "person-sky"] as const;

/** Colour worlds a person can give the whole app. */
export const WORLDS = ["salbei", "flieder", "pfirsich", "himmel", "rose", "sonne"] as const;
export type World = (typeof WORLDS)[number];

const WORLD_OF_COLOR: Record<string, World> = { "person-mint": "salbei", "person-lilac": "flieder", "person-peach": "pfirsich", "person-sky": "himmel" };

/** Until someone chooses, their world follows their person colour. */
export function defaultWorld(color: string): World {
  return WORLD_OF_COLOR[color] ?? "flieder";
}
export type PersonColor = (typeof PERSON_COLORS)[number];
