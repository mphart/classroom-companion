import type { NoteSourceType } from "../types";

function isEnglishLabel(lang: string): boolean {
  return /^english$/i.test(lang.trim());
}

/**
 * Default summary output is English. Non-English output is inferred only from **recording**
 * notes in the selection: all nonempty recordings must agree on one language, and none may
 * be English. Generated summaries and practice exams do not affect inference.
 */
export function inferSelectionSummaryLanguage(
  entries: ReadonlyArray<{ language: string; sourceType: NoteSourceType }>,
): string | null {
  const recordings = entries.filter((e) => e.sourceType === "recording");
  if (recordings.length === 0) return null;

  const langs = recordings.map((r) => (r.language?.trim() || "English").trim());
  if (langs.some(isEnglishLabel)) return null;

  const unique = new Set(langs);
  if (unique.size !== 1) return null;
  const [only] = unique;
  return only && !isEnglishLabel(only) ? only : null;
}
