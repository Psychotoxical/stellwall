import { hash, verify } from "@node-rs/argon2";

export function hashPassword(pw: string): Promise<string> {
  return hash(pw);
}

export async function verifyPassword(stored: string, pw: string): Promise<boolean> {
  try {
    return await verify(stored, pw);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;

/** Spend the same work as a real check when the username does not exist. */
export async function burnPasswordCheck(pw: string): Promise<void> {
  dummy ??= hashPassword("stellwall-dummy-password");
  await verifyPassword(await dummy, pw);
}
