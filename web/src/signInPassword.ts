/**
 * The password someone just signed in with, kept in memory only (never stored) until they pick
 * their own one, so the first-password page need not ask for it again. Gone on reload.
 */
let kept: string | null = null;

export function keepSignInPassword(password: string) {
  kept = password;
}

export function signInPassword(): string | null {
  return kept;
}

export function forgetSignInPassword() {
  kept = null;
}
