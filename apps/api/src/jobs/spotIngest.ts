import { ingestSpotSnapshots } from "../lib/ingestSpotSnapshots.js";

ingestSpotSnapshots()
  .then(() => {
    console.log("spot ingestion complete");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
