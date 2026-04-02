import { env } from "../env.js";
import { q } from "../db.js";

type SpotPayload = {
  gold: { price: number; sourceState: string };
  silver: { price: number; sourceState: string };
  updatedAt: string;
};

async function fetchPrimary(): Promise<SpotPayload> {
  const url = env.spotPrimaryFeedUrl?.trim();
  if (!url) throw new Error("No primary spot feed URL");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Primary spot feed unavailable");
  return (await res.json()) as SpotPayload;
}

async function fetchFallback() {
  const res = await fetch(env.spotFallbackFeedUrl, { cache: "no-store" });
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

  const rows = [
    {
      metal: "gold",
      price: data.gold.price,
      source_state: data.gold.sourceState ?? "primary"
    },
    {
      metal: "silver",
      price: data.silver.price,
      source_state: data.silver.sourceState ?? "primary"
    }
  ];
  for (const row of rows) {
    await q("insert into spot_snapshots (metal, price, source_state) values (?, ?, ?)", [
      row.metal,
      row.price,
      row.source_state
    ]);
  }
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
