/**
 * Normalizes and validates a user-entered Slack channel name. Free-text input
 * is used instead of a picker because the app's bot scopes (chat:write,
 * chat:write.public, im:write, commands, users:read — see
 * docs/slack-app-manifest.json) don't include channels:read/groups:read, so
 * the app cannot call conversations.list to populate a dropdown.
 *
 * Validation is by exclusion, not by allowlist. Slack channel names allow
 * lowercase letters, non-Latin characters, digits, hyphens and underscores,
 * capped at 80 characters — notably, periods are NOT allowed even though
 * they look harmless. An allowlist regex like [a-z0-9._-] would get this
 * wrong in both directions: it would accept "rsd.leaders" (which then fails
 * at runtime with channel_not_found, giving false confidence), and it would
 * reject a name like "開発チーム", which is entirely plausible in this
 * workspace. So this rejects only what is definitely invalid — whitespace,
 * '#', '.', empty, or over 80 chars — and lets everything else through.
 */

export const MAX_SLACK_CHANNEL_LENGTH = 80;

export const SLACK_CHANNEL_ERROR =
  "Channel names can't contain spaces, periods or '#', and must be 80 characters or fewer.";

const CHANNEL_ID_RE = /^[CGD][A-Z0-9]{7,}$/;

/** True for a string that already looks like a Slack channel ID (e.g. "C0123ABCD") rather than a name. */
function looksLikeChannelId(raw: string): boolean {
  return CHANNEL_ID_RE.test(raw);
}

export function isValidSlackChannel(name: string): boolean {
  if (!name || name.length > MAX_SLACK_CHANNEL_LENGTH) return false;
  if (/[\s.#]/.test(name)) return false;
  return true;
}

export type ParsedSlackChannel =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * Trims, strips a leading '#', and lowercases user input. Blank input means
 * "use the configured default" and parses to `{ ok: true, value: null }` —
 * never an empty string, so callers can safely fall back with `value || DEFAULT_CHANNEL`.
 */
export function parseSlackChannel(raw: string | null | undefined): ParsedSlackChannel {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: null };

  if (looksLikeChannelId(trimmed)) {
    return {
      ok: false,
      error: "Enter the channel name (e.g. rsd-leader-team), not the channel ID.",
    };
  }

  const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1).trim() : trimmed;
  if (!withoutHash) return { ok: true, value: null };

  const lowered = withoutHash.toLowerCase();
  if (!isValidSlackChannel(lowered)) {
    return { ok: false, error: SLACK_CHANNEL_ERROR };
  }
  return { ok: true, value: lowered };
}

/** Convenience wrapper for callers that only need the normalized value, treating an invalid input as "no value". */
export function normalizeSlackChannel(raw: string | null | undefined): string | null {
  const parsed = parseSlackChannel(raw);
  return parsed.ok ? parsed.value : null;
}
