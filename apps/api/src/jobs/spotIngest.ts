import { env } from "../env.js";
import { db } from "../db.js";

type SpotPayload = {
  gold: { price: number; sourceState: string };
  silver: { price: number; sourceState: string };
  updatedAt: string;
};

async function fetchPrimary(): Promise<SpotPayload> {
  const res = await fetch(env.spotPrimaryFeedUrl, { cache: "no-store" });
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

async function run() {
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
      source_state: data.gold.sourceState
    },
    {
      metal: "silver",
      price: data.silver.price,
      source_state: data.silver.sourceState
    }
  ];
  const { error } = await db.from("spot_snapshots").insert(rows);
  if (error) throw error;
  console.log("spot ingestion complete", data.updatedAt);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
