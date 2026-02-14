/**
 * MongoDB Connection - Elephant Memory Database
 * Stores known scammers for instant detection
 */

import { MongoClient, Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.warn("[MongoDB] No MONGODB_URI found - Elephant Memory disabled");
}

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Get MongoDB database connection
 */
export async function getDatabase(): Promise<Db | null> {
  if (!MONGODB_URI) return null;
  
  if (db) return db;

  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db("veritas");
    console.log("[MongoDB] 🐘 Elephant Memory connected");
    return db;
  } catch (error) {
    console.error("[MongoDB] Connection failed:", error);
    return null;
  }
}

/**
 * Close MongoDB connection (for cleanup)
 */
export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
