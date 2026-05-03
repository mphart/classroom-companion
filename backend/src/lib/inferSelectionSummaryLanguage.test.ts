import { describe, expect, it } from "vitest";
import { inferSelectionSummaryLanguage } from "./inferSelectionSummaryLanguage";

describe("inferSelectionSummaryLanguage", () => {
  it("returns null when there are no recordings", () => {
    expect(
      inferSelectionSummaryLanguage([
        { language: "Spanish", sourceType: "generated_summary" },
        { language: "Spanish", sourceType: "generated_practice_exam" },
      ]),
    ).toBeNull();
  });

  it("returns the shared non-English language when all recordings agree", () => {
    expect(
      inferSelectionSummaryLanguage([
        { language: "Spanish", sourceType: "recording" },
        { language: "Spanish", sourceType: "recording" },
      ]),
    ).toBe("Spanish");
  });

  it("ignores generated notes for inference", () => {
    expect(
      inferSelectionSummaryLanguage([
        { language: "Spanish", sourceType: "generated_summary" },
        { language: "French", sourceType: "recording" },
        { language: "French", sourceType: "recording" },
      ]),
    ).toBe("French");
  });

  it("returns null if any recording is English", () => {
    expect(
      inferSelectionSummaryLanguage([
        { language: "Spanish", sourceType: "recording" },
        { language: "English", sourceType: "recording" },
      ]),
    ).toBeNull();
  });

  it("returns null when recordings disagree on non-English", () => {
    expect(
      inferSelectionSummaryLanguage([
        { language: "Spanish", sourceType: "recording" },
        { language: "French", sourceType: "recording" },
      ]),
    ).toBeNull();
  });
});
