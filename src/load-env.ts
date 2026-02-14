/**
 * Load .env and .env.local BEFORE any other module reads process.env.
 * Must be the first import in server-http.ts and mcp-server.ts.
 */
import path from "node:path";
import { config } from "dotenv";

const root = process.cwd();
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local") });
