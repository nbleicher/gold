import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? "",
  spotPrimaryFeedUrl: process.env.SPOT_PRIMARY_FEED_URL ?? "",
  spotFallbackFeedUrl:
    process.env.SPOT_FALLBACK_FEED_URL ??
    "https://data-asg.goldprice.org/dbXRates/USD",
  /** When set, enables `POST /v1/spot/push` with `Authorization: Bearer <secret>`. */
  spotPushSecret: process.env.SPOT_PUSH_SECRET ?? ""
};
