import { env } from "../env.js";
import { txQ, withWriteTx } from "../db.js";

const FETCH_TIMEOUT_MS = 15_000;

export type SpotMetalPayload = { price: number; sourceState: string };

/** Same shape as `spot-feed.json` / primary feed; `updatedAt` is informational only for DB inserts. */
export type SpotPayload = {
  gold: SpotMetalPayload;
  silver: SpotMetalPayload;
  updatedAt?: string;
};

/** Inserts two rows (gold, silver) into `spot_snapshots`. */
export async function applySpotPayloadToDb(data: SpotPayload): Promise<void> {
  const rows = [
    {
      metal: "gold" as const,
      price: data.gold.price,
      source_state: data.gold.sourceState ?? "primary"
    },
    {
      metal: "silver" as const,
      price: data.silver.price,
      source_state: data.silver.sourceState ?? "primary"
    }
  ];
  try {
    await withWriteTx(async (tx) => {
      for (const row of rows) {
        await txQ(tx, "insert into spot_snapshots (metal, price, source_state) values (?, ?, ?)", [
          row.metal,
          row.price,
          row.source_state
        ]);
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const context = {
      gold: { price: data.gold.price, sourceState: data.gold.sourceState },
      silver: { price: data.silver.price, sourceState: data.silver.sourceState }
    };
    throw new Error(`Spot snapshot ingest failed: ${msg}; context=${JSON.stringify(context)}`);
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { cache: "no-store", signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchPrimary(): Promise<SpotPayload> {
  const url = env.spotPrimaryFeedUrl?.trim();
  if (!url) throw new Error("No primary spot feed URL");
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error("Primary spot feed unavailable");
  return (await res.json()) as SpotPayload;
}

async function fetchFallback() {
  const res = await fetchWithTimeout(env.spotFallbackFeedUrl);
  if (!res.ok) throw new Error("Fallback spot feed unavailable");
  const json = await res.json();
  const item = json?.items?.[0];
  if (!item) throw new Error("Fallback spot feed invalid");
  return {
    gold: Number(item.xauPrice),
    silver: Number(item.xagPrice)
  };
}

async function runIngestOnce(): Promise<void> {
  let data: SpotPayload;
  try {
    data = await fetchPrimary();
  } catch {
    const fallback = await fetchFallback();
    data = {
      gold: { price: fallback.gold, sourceState: "fallback" },
      silver: { price: fallback.silver, sourceState: "fallback" },
      updatedAt: new Date().toISOString()
    };
  }

  await applySpotPayloadToDb(data);
}

let ingestInFlight: Promise<void> | null = null;

/** Fetches spot from primary/fallback and inserts two rows. Concurrent callers share one run. */
export function ingestSpotSnapshots(): Promise<void> {
  if (!ingestInFlight) {
    ingestInFlight = runIngestOnce().finally(() => {
      ingestInFlight = null;
    });
  }
  return ingestInFlight;
}
