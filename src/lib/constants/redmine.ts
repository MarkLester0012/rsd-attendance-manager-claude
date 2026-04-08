// Default Redmine activity types (fetched dynamically per user, these are fallbacks)
export const DEFAULT_ACTIVITIES = [
  { id: 9, name: "Development" },
  { id: 10, name: "Design" },
  { id: 11, name: "Meeting" },
  { id: 12, name: "Code Review" },
  { id: 13, name: "Testing" },
  { id: 14, name: "Documentation" },
] as const;

// Known Slack EOD terminators (lines to ignore when parsing)
export const SLACK_TERMINATORS = [
  "otsukaresamadesu",
  "otsukaresama",
  "@here",
  "@channel",
  "progress:",
  "progress",
  "will continue",
] as const;

// Slack emoji shortcode pattern
export const EMOJI_SHORTCODE_REGEX = /:[a-z0-9_+-]+(?::skin-tone-\d)?:/g;
