import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  tursoDatabaseUrl: required("TURSO_DATABASE_URL"),
  tursoAuthToken: required("TURSO_AUTH_TOKEN"),
  jwtSecret: required("JWT_SECRET"),
  spotPrimaryFeedUrl: process.env.SPOT_PRIMARY_FEED_URL ?? "",
  spotFallbackFeedUrl:
    process.env.SPOT_FALLBACK_FEED_URL ??
    "https://data-asg.goldprice.org/dbXRates/USD",
  /** When latest gold+silver snapshots are older than this (ms), GET /v1/spot/latest triggers ingest. 0 = disable. */
  spotOnDemandMaxAgeMs: (() => {
    const raw = process.env.SPOT_ON_DEMAND_MAX_AGE_MS;
    if (raw === undefined || raw === "") return 120000;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : 120000;
  })()
};
