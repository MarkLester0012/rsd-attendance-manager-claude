import { describe, it, expect } from "vitest";
import { parseSlackChannel, normalizeSlackChannel, isValidSlackChannel } from "./slack-channel";

describe("parseSlackChannel", () => {
  it("passes a bare valid name through unchanged", () => {
    expect(parseSlackChannel("rsd-leader-team")).toEqual({ ok: true, value: "rsd-leader-team" });
  });

  it("strips a leading '#'", () => {
    expect(parseSlackChannel("#dev-team")).toEqual({ ok: true, value: "dev-team" });
  });

  it("trims and lowercases", () => {
    expect(parseSlackChannel("  #Dev-Team  ")).toEqual({ ok: true, value: "dev-team" });
  });

  it("treats blank, whitespace-only, null and undefined as 'use the default'", () => {
    expect(parseSlackChannel("")).toEqual({ ok: true, value: null });
    expect(parseSlackChannel("   ")).toEqual({ ok: true, value: null });
    expect(parseSlackChannel("#")).toEqual({ ok: true, value: null });
    expect(parseSlackChannel(null)).toEqual({ ok: true, value: null });
    expect(parseSlackChannel(undefined)).toEqual({ ok: true, value: null });
  });

  it("rejects a name containing a space", () => {
    const result = parseSlackChannel("bad channel");
    expect(result.ok).toBe(false);
  });

  it("rejects a name containing a period", () => {
    // Slack does NOT allow periods in channel names, even though it looks harmless.
    const result = parseSlackChannel("rsd.leaders");
    expect(result.ok).toBe(false);
  });

  it("accepts a non-Latin channel name", () => {
    expect(parseSlackChannel("開発チーム")).toEqual({ ok: true, value: "開発チーム" });
  });

  it("accepts exactly 80 characters and rejects 81", () => {
    const eighty = "a".repeat(80);
    const eightyOne = "a".repeat(81);
    expect(parseSlackChannel(eighty)).toEqual({ ok: true, value: eighty });
    expect(parseSlackChannel(eightyOne).ok).toBe(false);
  });

  it("rejects a pasted channel ID with a specific message", () => {
    const result = parseSlackChannel("C0123ABCD");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/channel ID/);
    }
  });

  it("accepts hyphens and underscores", () => {
    expect(parseSlackChannel("dev_team-2")).toEqual({ ok: true, value: "dev_team-2" });
  });
});

describe("normalizeSlackChannel", () => {
  it("returns the normalized value for valid input", () => {
    expect(normalizeSlackChannel("#Dev-Team")).toBe("dev-team");
  });

  it("returns null for blank input", () => {
    expect(normalizeSlackChannel("")).toBe(null);
  });

  it("returns null (never throws) for invalid input", () => {
    expect(normalizeSlackChannel("bad channel")).toBe(null);
  });
});

describe("isValidSlackChannel", () => {
  it("rejects empty strings", () => {
    expect(isValidSlackChannel("")).toBe(false);
  });

  it("rejects strings over 80 characters", () => {
    expect(isValidSlackChannel("a".repeat(81))).toBe(false);
  });

  it("accepts a valid lowercase name", () => {
    expect(isValidSlackChannel("rsd-leader-team")).toBe(true);
  });
});
