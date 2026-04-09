import type { ParsedSlackEntry } from "@/lib/types";
import { SLACK_TERMINATORS, EMOJI_SHORTCODE_REGEX } from "@/lib/constants/redmine";

// Matches: #83323 - 100%, 83606 - 100%, #74937: In-Progress, 83746 - :ok:, 83175 - Done
// Also: - #83323 - 100% (bullet), #83323 100% (no separator), 83323 Done (no # sign)
const TICKET_PATTERN = /^\s*[-*•]?\s*#?(\d{4,6})\s*(?:[-:]\s*)?(.+)?/;

function extractPercentage(statusText: string): number {
  const match = statusText.match(/(\d{1,3})%/);
  return match ? parseInt(match[1], 10) : 0;
}

function isTerminatorLine(line: string): boolean {
  const cleaned = line
    .replace(EMOJI_SHORTCODE_REGEX, "")
    .replace(/[!.,]+$/, "")
    .trim()
    .toLowerCase();
  if (!cleaned) return true;
  return SLACK_TERMINATORS.some(
    (t) => cleaned === t || cleaned.startsWith(t + " ") || cleaned.startsWith(t + "!")
  );
}

function isSkipLine(line: string): boolean {
  const trimmed = line.trim().toLowerCase();
  return (
    !trimmed ||
    trimmed === "@here" ||
    trimmed === "@channel" ||
    trimmed === "progress:" ||
    trimmed === "progress"
  );
}

export function parseSlackEOD(text: string): ParsedSlackEntry[] {
  const lines = text.split("\n");
  const entries: ParsedSlackEntry[] = [];

  let currentEntry: ParsedSlackEntry | null = null;
  const descriptionLines: string[] = [];

  function flushEntry() {
    if (currentEntry) {
      currentEntry.description = descriptionLines.join("\n").trim();
      entries.push(currentEntry);
      descriptionLines.length = 0;
      currentEntry = null;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and @here/@channel/Progress: headers
    if (isSkipLine(line)) continue;

    // Check for ticket pattern
    const match = line.match(TICKET_PATTERN);
    if (match) {
      flushEntry();
      const statusText = (match[2] || "").trim();
      currentEntry = {
        issueId: parseInt(match[1], 10),
        percentage: extractPercentage(statusText),
        description: "",
      };
      continue;
    }

    // Skip terminator lines (otsukaresamadesu, etc.)
    if (isTerminatorLine(line)) continue;

    // Accumulate description lines for current entry
    if (currentEntry) {
      descriptionLines.push(line);
    }
  }

  flushEntry();
  return entries;
}
