import { describe, expect, it } from "vitest";
import {
  buildListenUrl,
  normalizeDeepgramServerMessage,
  normalizeLanguageCode,
  pickDeepgramFirstAlternative,
} from "../lib/deepgramLive";

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
      expect(url).toContain("words=true");
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

  it("normalizeDeepgramServerMessage ignores Metadata frames", () => {
    expect(
      normalizeDeepgramServerMessage({
        type: "Metadata",
        metadata: { request_id: "x" },
      }),
    ).toBeNull();
  });

  it("pickDeepgramFirstAlternative reads channels[0] when present", () => {
    const alt = pickDeepgramFirstAlternative({
      type: "Results",
      is_final: true,
      channels: [
        {
          alternatives: [
            {
              transcript: "hello",
              words: [{ word: "hello", confidence: 0.91, start: 0, end: 0.5 }],
            },
          ],
        },
      ],
    });
    expect(alt?.transcript).toBe("hello");
    expect(alt?.words?.length).toBe(1);
  });

  it("normalizeDeepgramServerMessage forwards word confidences", () => {
    const msg = {
      channel: {
        alternatives: [
          {
            transcript: "Hello world.",
            words: [
              { punctuated_word: "Hello", confidence: 0.99, start: 0, end: 0.3 },
              { punctuated_word: "world.", confidence: 0.62, start: 0.35, end: 0.7 },
            ],
          },
        ],
      },
      is_final: false,
    };
    expect(normalizeDeepgramServerMessage(msg)).toEqual({
      type: "partial",
      text: "Hello world.",
      words: [
        { word: "Hello", confidence: 0.99 },
        { word: "world.", confidence: 0.62 },
      ],
    });
  });
});
