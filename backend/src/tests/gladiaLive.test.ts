import { describe, expect, it } from "vitest";
import { gladiaErrorMessage, normalizeGladiaServerMessage } from "../lib/gladiaLive";

describe("gladiaLive", () => {
  it("maps translation events to final client transcripts", () => {
    const msg = {
      type: "translation",
      error: null,
      data: {
        translated_utterance: {
          text: "  hola  ",
          language: "es",
          start: 1,
          end: 2.5,
        },
      },
    };
    expect(normalizeGladiaServerMessage(msg, true)).toEqual({
      type: "final",
      text: "hola",
      start: 1,
      duration: 1.5,
    });
  });

  it("ignores transcript payloads when preferTranslation is true", () => {
    const msg = {
      type: "transcript",
      data: {
        is_final: true,
        utterance: { text: "hello", language: "en" },
      },
    };
    expect(normalizeGladiaServerMessage(msg, true)).toBeNull();
  });

  it("maps transcript events when preferTranslation is false", () => {
    const partial = {
      type: "transcript",
      data: {
        is_final: false,
        utterance: { text: "hel", start: 0, end: 0.2 },
      },
    };
    expect(normalizeGladiaServerMessage(partial, false)).toEqual({
      type: "partial",
      text: "hel",
      start: 0,
      duration: 0.2,
    });
  });

  it("extracts Gladia error messages", () => {
    expect(gladiaErrorMessage({ type: "error", message: "bad request" })).toBe("bad request");
    expect(gladiaErrorMessage({ type: "transcript", data: {} })).toBeNull();
  });
});
