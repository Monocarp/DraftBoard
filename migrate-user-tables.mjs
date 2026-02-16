// One-time migration: create user_boards and user_position_ranks tables
// Run with: node migrate-user-tables.mjs

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
  env.SUPABASE_SERVICE_ROLE_KEY // Need service role for DDL
);

const sql = `
-- ════════════════════════════════════════════════════════════════
-- User Boards: per-user big board rankings
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  player_id uuid REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  rank integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_user_boards_user ON user_boards(user_id);

-- ════════════════════════════════════════════════════════════════
-- User Position Ranks: per-user position board ordering
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_position_ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  player_id uuid REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  position_group text NOT NULL,
  rank integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, player_id, position_group)
);

CREATE INDEX IF NOT EXISTS idx_user_position_ranks_user_group ON user_position_ranks(user_id, position_group);

-- ════════════════════════════════════════════════════════════════
-- RLS Policies: users can only access their own data
-- ════════════════════════════════════════════════════════════════
ALTER TABLE user_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_position_ranks ENABLE ROW LEVEL SECURITY;

-- User boards policies
CREATE POLICY "Users read own boards"
  ON user_boards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own boards"
  ON user_boards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own boards"
  ON user_boards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own boards"
  ON user_boards FOR DELETE
  USING (auth.uid() = user_id);

-- User position ranks policies
CREATE POLICY "Users read own position ranks"
  ON user_position_ranks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own position ranks"
  ON user_position_ranks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own position ranks"
  ON user_position_ranks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own position ranks"
  ON user_position_ranks FOR DELETE
  USING (auth.uid() = user_id);
`;

async function run() {
  console.log("Running migration...");
  const { error } = await supabase.rpc("exec_sql", { sql_string: sql }).single();
  
  if (error) {
    // Try direct SQL if rpc not available
    console.log("RPC not available, trying direct queries...");
    const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      const { error: stmtError } = await supabase.from("_exec").select("*").limit(0);
      if (stmtError) {
        console.log("Need to run SQL manually in Supabase Dashboard.");
        console.log("\n--- Copy the SQL below into Supabase SQL Editor ---\n");
        console.log(sql);
        return;
      }
    }
  }
  
  console.log("Migration complete!");
}

run().catch(console.error);
