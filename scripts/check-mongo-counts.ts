/**
 * Check MongoDB collection counts for deployer_lineage and website_snapshots.
 * Run: npx tsx scripts/check-mongo-counts.ts
 * Requires MONGODB_URI in .env.local
 */
import path from "node:path";
import { config } from "dotenv";
import { MongoClient } from "mongodb";

config({ path: path.join(process.cwd(), ".env") });
config({ path: path.join(process.cwd(), ".env.local") });

const LINEAGE_COLLECTION = "deployer_lineage";
const WEBSITE_SNAPSHOT_COLLECTION = "website_snapshots";
const DB_NAME = "veritas";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set. Add it to .env.local");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const lineageCount = await db.collection(LINEAGE_COLLECTION).countDocuments();
    const snapshotCount = await db.collection(WEBSITE_SNAPSHOT_COLLECTION).countDocuments();

    console.log("\n--- Elephant Memory counts ---");
    console.log(`deployer_lineage:  ${lineageCount}`);
    console.log(`website_snapshots:  ${snapshotCount}`);
    console.log("--------------------------------\n");

    if (lineageCount === 0 && snapshotCount === 0) {
      console.log("⚠️  Both collections are empty. Memory is not live yet.");
      console.log("   Run some scans to populate lineage and snapshots.");
    } else {
      console.log("✓ Memory is live.");
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
