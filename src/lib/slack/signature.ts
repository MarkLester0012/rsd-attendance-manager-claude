import crypto from "crypto";

const MAX_AGE_SECONDS = 5 * 60;

export function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null
): boolean {
  if (!timestamp || !signature) return false;

  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;

  const ts = parseInt(timestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > MAX_AGE_SECONDS) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto
    .createHmac("sha256", signingSecret)
    .update(baseString)
    .digest("hex")}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    return false;
  }
}
