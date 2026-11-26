export type Config = {
  databaseUrl: string;
  port: number;
  publicUrl: string;
  cookieSecure: boolean;
  webDir: string | null;
  timeZone: string;
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
  };
}
