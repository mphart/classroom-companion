import { describe, expect, it } from "vitest";
import { buildListenUrl, normalizeDeepgramServerMessage, normalizeLanguageCode } from "../lib/deepgramLive";

describe("deepgramLive", () => {
  it("normalizeLanguageCode maps UI labels", () => {
    expect(normalizeLanguageCode("English")).toBe("en");
    expect(normalizeLanguageCode("Spanish")).toBe("es");
    expect(normalizeLanguageCode("Mandarin")).toBe("zh");
    expect(normalizeLanguageCode("en-US")).toBe("en-us");
  });

  it("buildListenUrl contains required streaming parameters", () => {
    const prev = process.env.DG_MODEL;
    process.env.DG_MODEL = "nova-2-test";
    try {
      const url = buildListenUrl({ language: "en" });
      expect(url).toContain("/v1/listen?");
      expect(url).toContain("encoding=linear16");
      expect(url).toContain("sample_rate=16000");
      expect(url).toContain("channels=1");
      expect(url).toContain("interim_results=true");
      expect(url).toContain("smart_format=true");
      expect(url).toContain("language=en");
      expect(url).toContain("model=nova-2-test");
    } finally {
      if (prev === undefined) delete process.env.DG_MODEL;
      else process.env.DG_MODEL = prev;
    }
  });

  it("normalizeDeepgramServerMessage extracts transcript", () => {
    const partialMsg = {
      channel: {
        alternatives: [{ transcript: "hello there" }],
      },
      is_final: false,
      start: 0.42,
      duration: 1.2,
    };
    expect(normalizeDeepgramServerMessage(partialMsg)).toEqual({
      type: "partial",
      text: "hello there",
      start: 0.42,
      duration: 1.2,
    });

    const finalMsg = {
      channel: { alternatives: [{ transcript: "Final text." }] },
      is_final: true,
    };
    expect(normalizeDeepgramServerMessage(finalMsg)).toEqual({
      type: "final",
      text: "Final text.",
    });
  });

  it("normalizeDeepgramServerMessage returns null for empty transcript", () => {
    expect(normalizeDeepgramServerMessage({ channel: { alternatives: [{ transcript: "   " }] }, is_final: false })).toBeNull();
  });
});
