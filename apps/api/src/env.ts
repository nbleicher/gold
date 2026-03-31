import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  spotPrimaryFeedUrl: process.env.SPOT_PRIMARY_FEED_URL ?? "",
  spotFallbackFeedUrl:
    process.env.SPOT_FALLBACK_FEED_URL ??
    "https://data-asg.goldprice.org/dbXRates/USD"
};
