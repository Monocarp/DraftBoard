"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServer } from "@/lib/supabase-server";
import { SKILLS_TRAITS_TEMPLATE, resolveTemplate } from "@/lib/position-templates";

// ─── Source Abbreviations ─────────────────────────────────────────────────────

const SOURCE_ABBREVIATIONS: Record<string, string> = {
  "PFF": "PFF",
  "PFF Preseason": "PFF-Pre",
  "Bleacher Report": "BR",
  "Walter Football": "WF",
  "NFL.com": "NFL",
  "The Ringer": "Ringer",
  "First Draft": "FD",
  "NFL Draft Buzz": "NFLDB",
  "ESPN": "ESPN",
  "NFL Stock Exchange": "NFLSE",
  "Mel Kiper": "Kiper",
  "Todd McShay": "McShay",
  "The Beast": "Beast",
  "Dane Brugler": "Brugler",
  "Matt Miller": "Miller",
  "Daniel Jeremiah": "DJ",
  "Jordan Reid": "Reid",
  "The Draft Network": "TDN",
  "Field Yates": "Yates",
};

function getAbbreviation(source: string): string {
  return SOURCE_ABBREVIATIONS[source] ?? source;
}

// ─── Server Action ────────────────────────────────────────────────────────────

export async function analyzeCommentary(
  slug: string,
  source: string,
  sections: { title: string | null; text: string }[]
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServer();

  // Admin auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return { error: "Unauthorized" };
  }

  // Fetch player record
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("id, position, skills_traits, analyzed_sources")
    .eq("slug", slug)
    .single();

  if (playerErr || !player) return { error: "Player not found" };

  // Guard: already analyzed
  const analyzedSources: string[] = (player.analyzed_sources as string[]) ?? [];
  if (analyzedSources.includes(source)) {
    return { error: `${source} has already been analyzed. Remove it from analyzed_sources to re-run.` };
  }

  // Resolve position → template → categories
  const template = resolveTemplate(player.position ?? "");
  if (!template) return { error: `No template configured for position: ${player.position}` };

  const categories = SKILLS_TRAITS_TEMPLATE[template];
  if (!categories || categories.length === 0) {
    return { error: `No skills/traits categories configured for ${template}` };
  }

  // Build report text from sections
  const reportText = sections
    .map((s) => (s.title ? `${s.title}:\n${s.text}` : s.text))
    .join("\n\n");

  if (!reportText.trim()) return { error: "Report has no text content" };

  const abbr = getAbbreviation(source);

  // Build empty JSON structure for the prompt
  const emptyStructure = Object.fromEntries(
    categories.map((cat) => [cat, { positives: [], negatives: [] }])
  );

  const prompt = `You are extracting structured scouting data from an NFL Draft scouting report.

Extract verbatim quotes from the report that meaningfully indicate a strength (positive) or weakness (negative) for each category listed below.

Rules:
- Use verbatim quotes only. You may use ellipses (...) to trim unnecessary surrounding verbiage.
- Do NOT paraphrase, summarize, or add commentary.
- If a quote applies to multiple categories, include it in each.
- If a category has no relevant quotes, return empty arrays.
- Return ONLY valid JSON — no markdown fences, no explanation, no text before or after.

Categories:
${categories.map((c) => `- ${c}`).join("\n")}

Return this exact JSON structure (populate the arrays with quoted strings):
${JSON.stringify(emptyStructure, null, 2)}

Report:
${reportText}`;

  // Call Claude Haiku
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let responseText: string;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    const block = msg.content[0];
    if (block.type !== "text") return { error: "Unexpected response format from AI" };
    responseText = block.text.trim();
  } catch (err) {
    return { error: `AI call failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Parse JSON — strip markdown fences if the model included them anyway
  let parsed: Record<string, { positives: string[]; negatives: string[] }>;
  try {
    const jsonStr = responseText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    parsed = JSON.parse(jsonStr);
  } catch {
    return { error: "AI returned invalid JSON" };
  }

  // Merge quotes into existing skills_traits
  type SkillEntry = { positives: string | null; negatives: string | null };
  const existing: Record<string, SkillEntry> =
    (player.skills_traits as Record<string, SkillEntry>) ?? {};
  const updated = { ...existing };

  const appendLines = (current: string | null, newQuotes: string[]): string | null => {
    if (!newQuotes.length) return current;
    const formatted = newQuotes.map((q) => `"${q.trim()}" (${abbr})`);
    const base = current?.trim() ?? "";
    return base ? `${base}\n${formatted.join("\n")}` : formatted.join("\n");
  };

  for (const cat of categories) {
    const catData = parsed[cat];
    if (!catData) continue;
    const current = updated[cat] ?? { positives: null, negatives: null };
    updated[cat] = {
      positives: appendLines(current.positives, catData.positives ?? []),
      negatives: appendLines(current.negatives, catData.negatives ?? []),
    };
  }

  // Persist to DB
  const { error: updateErr } = await supabase
    .from("players")
    .update({
      skills_traits: updated,
      analyzed_sources: [...analyzedSources, source],
    })
    .eq("id", player.id);

  if (updateErr) return { error: updateErr.message };

  return { success: true };
}
