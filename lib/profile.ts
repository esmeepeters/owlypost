import { getLlm } from "./llm/index.ts";
import type { Storage } from "./storage/index.ts";

const PROFILE_MAX_TOKENS = 800;

// Rewrites the preference profile from the current text (which may have been
// edited by hand — manual edits are first class and always form the base)
// plus all feedback created since the last synthesis. Skips when there is no
// new feedback. Returns true when the profile was updated.
export async function synthesizeProfile(storage: Storage): Promise<boolean> {
  const profile = await storage.getProfile();
  if (!profile) return false;

  const [feedbackRows, sectionRows] = await Promise.all([
    storage.listFeedbackSince(profile.updated_at),
    storage.listSectionFeedbackSince(profile.updated_at),
  ]);

  if (feedbackRows.length === 0 && sectionRows.length === 0) return false;

  const feedbackLines = feedbackRows.map((row) => {
    const title = row.title ?? "(deleted item)";
    const verdictReason = row.reason ? ` (verdict reason: ${row.reason})` : "";
    const comment = row.comment ? ` — reader's comment: ${row.comment}` : "";
    return `- ${row.rating === "up" ? "👍" : "👎"} "${title}"${verdictReason}${comment}`;
  });

  const sectionLines = sectionRows.map((row) => {
    const comment = row.comment ? ` — reader's comment: ${row.comment}` : "";
    return `- ${row.rating === "up" ? "👍" : "👎"} summary of "${row.category}" (week of ${row.week_start})${comment}`;
  });

  const language = process.env.DIGEST_LANGUAGE || "en";
  const prompt = [
    "You maintain the reading-preference profile for the single reader of a personal weekly digest.",
    `Rewrite the profile below as a markdown document of at most 400 words, in the language "${language}", describing stable reading preferences:`,
    "- topics and angles the reader values",
    "- what gets a thumbs down and why",
    "- preferred depth and formats",
    "- sources that consistently over- or underperform",
    "",
    "The current profile may contain manual edits by the reader; treat it as authoritative and build on it rather than discarding it. Integrate the new feedback, generalize where patterns repeat, and drop nothing that still holds.",
    "",
    "Current profile:",
    profile.profile_md.trim() || "(empty)",
    "",
    "New feedback since the last update:",
    ...(feedbackLines.length > 0 ? feedbackLines : ["(none)"]),
    "",
    "New feedback on category summaries since the last update:",
    ...(sectionLines.length > 0 ? sectionLines : ["(none)"]),
    "",
    "Respond with the markdown document only - no preamble, no code fences.",
  ].join("\n");

  const llm = getLlm();
  const { text: raw } = await llm.callText({
    model: llm.summaryModel,
    prompt,
    maxTokens: PROFILE_MAX_TOKENS,
  });

  const text = raw
    .trim()
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/, "");

  if (!text) return false;

  await storage.updateProfileSynthesis(text);
  return true;
}
