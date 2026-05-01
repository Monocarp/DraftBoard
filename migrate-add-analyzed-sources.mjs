// One-time migration: add analyzed_sources column to players table
// Run with: node migrate-add-analyzed-sources.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Read env from .env.local
const envContent = readFileSync(".env.local", "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) env[key.trim()] = rest.join("=").trim();
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const { error } = await supabase.rpc("exec_sql", {
  sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS analyzed_sources jsonb NOT NULL DEFAULT '[]';`,
});

if (error) {
  // exec_sql RPC may not exist — fall back to a direct check
  console.error("RPC failed (expected if exec_sql not set up):", error.message);
  console.log("\nRun this SQL manually in the Supabase dashboard SQL editor:\n");
  console.log("ALTER TABLE players ADD COLUMN IF NOT EXISTS analyzed_sources jsonb NOT NULL DEFAULT '[]';");
} else {
  console.log("✓ analyzed_sources column added (or already existed).");
}
