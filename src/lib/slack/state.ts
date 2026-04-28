import crypto from "crypto";

const EXPIRY_SECONDS = 10 * 60;

function getSecret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return key;
}

export function signState(userId: string): string {
  const expiry = Math.floor(Date.now() / 1000) + EXPIRY_SECONDS;
  const payload = `${userId}.${expiry}`;
  const hmac = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${hmac}`;
}

export function verifyState(state: string | null): { userId: string } | null {
  if (!state) return null;
  const dotIdx = state.lastIndexOf(".");
  if (dotIdx === -1) return null;

  const encodedPayload = state.slice(0, dotIdx);
  const providedHmac = state.slice(dotIdx + 1);

  const expectedHmac = crypto
    .createHmac("sha256", getSecret())
    .update(Buffer.from(encodedPayload, "base64url").toString())
    .digest("base64url");

  try {
    const match = crypto.timingSafeEqual(
      Buffer.from(expectedHmac, "utf8"),
      Buffer.from(providedHmac, "utf8")
    );
    if (!match) return null;
  } catch {
    return null;
  }

  const payload = Buffer.from(encodedPayload, "base64url").toString();
  const [userId, expiryStr] = payload.split(".");
  if (!userId || !expiryStr) return null;

  const expiry = parseInt(expiryStr, 10);
  if (Math.floor(Date.now() / 1000) > expiry) return null;

  return { userId };
}
