import data from "@emoji-mart/data";

type EmojiData = {
  emojis: Record<string, { skins: { native: string }[] }>;
};

const emojiData = (data as EmojiData).emojis;

// Build shortcode → native emoji map once (default skin tone)
const shortcodeMap: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [id, emoji] of Object.entries(emojiData)) {
    if (emoji.skins?.[0]?.native) {
      map[id] = emoji.skins[0].native;
    }
  }
  return map;
})();

export function emojify(text: string): string {
  // Handle :emoji::skin-tone-N: (N = 2–6 → skins index 1–5)
  return text
    .replace(
      /:([a-zA-Z0-9_+-]+)::skin-tone-([2-6]):/g,
      (match, code, tone) => {
        const emoji = emojiData[code];
        const skinIndex = parseInt(tone) - 1;
        return emoji?.skins?.[skinIndex]?.native ?? shortcodeMap[code] ?? match;
      }
    )
    .replace(/:([a-zA-Z0-9_+-]+):/g, (match, code) => {
      return shortcodeMap[code] ?? match;
    });
}
