export type Config = {
  databaseUrl: string;
  port: number;
  publicUrl: string;
  cookieSecure: boolean;
  webDir: string | null;
  timeZone: string;
  /** Folder with the Android app (stellwall.apk, android.json) the phones update from. */
  appDir: string | null;
  /** Firebase service account JSON for sending to Android phones; without it they get nothing. */
  firebaseAccountFile: string | null;
  /** Folder for the encrypted documents. */
  docsDir: string | null;
  /** The 32-byte document key; without it documents are off. */
  docsKeyFile: string | null;
};

function required(env: Record<string, string | undefined>, name: string): string {
  const v = env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  return {
    databaseUrl: required(env, "DATABASE_URL"),
    publicUrl: required(env, "PUBLIC_URL").replace(/\/$/, ""),
    port: env.PORT ? Number(env.PORT) : 8080,
    cookieSecure: env.COOKIE_SECURE !== "false",
    webDir: env.WEB_DIR ?? null,
    timeZone: env.TZ || "Europe/Berlin",
    appDir: env.APP_DIR ?? null,
    firebaseAccountFile: env.FIREBASE_ACCOUNT_FILE ?? null,
    docsDir: env.DOCS_DIR || "/data/documents",
    docsKeyFile: env.DOCS_KEY_FILE || null,
  };
}
