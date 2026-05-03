import { GoogleGenerativeAI } from "@google/generative-ai";
import { SummarizerError } from "./errors";

/** Recent transcript window sent to the model (chars). */
export const SLIDE_MATCH_TRANSCRIPT_WINDOW = 1500;

/** Max slides included in the prompt window when a `currentSlide` hint is given. */
const SLIDE_WINDOW_BACK = 2;
const SLIDE_WINDOW_FORWARD = 6;

/** If the deck is at most this many slides, send all of them regardless of `currentSlide`. */
const SMALL_DECK_LIMIT = 30;

/** Hard cap on chars per slide we include in the prompt (avoids blowing up token budget). */
const PER_SLIDE_CHAR_CAP = 600;

export type DeckSlide = { n: number; text: string };

export type SlideMatchResult = {
  slideNumber: number;
  confidence: number;
  reason?: string;
};

/** Prefer dedicated key so live slide sync does not share quota with summaries / Q&A. */
function getSlideMatchApiKey(): string | undefined {
  return (
    process.env.SLIDESHOW_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    undefined
  );
}

function getModelName(): string {
  return (process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite").trim();
}

/**
 * Parse a slide_pdf note's `raw_text` (produced by `extractPdfTextWithSlideMarkers`) back into
 * `{ n, text }` per slide. Slides with no extracted text get an empty string.
 */
export function parseSlidePdfRawText(rawText: string): DeckSlide[] {
  if (!rawText || typeof rawText !== "string") return [];
  const trimmed = rawText.trim();
  if (!trimmed) return [];
  // Split on the marker but keep the slide numbers via regex capture.
  const parts = trimmed.split(/\n*---\s*Slide\s+(\d+)\s*---\n*/i);
  // `parts[0]` is the prelude (usually empty); then alternating [n, text, n, text, ...].
  const out: DeckSlide[] = [];
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const n = Number.parseInt(parts[i], 10);
    if (!Number.isFinite(n) || n < 1) continue;
    const text = (parts[i + 1] ?? "").replace(/\s+/g, " ").trim();
    out.push({ n, text });
  }
  // If no markers were found at all, treat the whole text as a single slide so we at least try.
  if (out.length === 0) {
    return [{ n: 1, text: trimmed.replace(/\s+/g, " ") }];
  }
  return out.sort((a, b) => a.n - b.n);
}

/**
 * Pick the slides we send to Gemini. For small decks we include all of them; for larger decks
 * we focus on a window around `currentSlide`. We always include at least one slide.
 */
export function pickDeckWindow(deck: DeckSlide[], currentSlide?: number): DeckSlide[] {
  if (deck.length === 0) return [];
  if (deck.length <= SMALL_DECK_LIMIT) return deck;
  const anchor =
    typeof currentSlide === "number" && Number.isFinite(currentSlide)
      ? Math.min(Math.max(Math.round(currentSlide), 1), deck.length)
      : 1;
  const lo = Math.max(1, anchor - SLIDE_WINDOW_BACK);
  const hi = Math.min(deck.length, anchor + SLIDE_WINDOW_FORWARD);
  return deck.filter((s) => s.n >= lo && s.n <= hi);
}

const MATCH_SYSTEM = `You are matching a live lecture transcript to a slide deck. Decide which slide the lecturer is MOST LIKELY presenting RIGHT NOW.

Rules:
- Use only the SLIDES list and the recent TRANSCRIPT below. Do not invent content.
- Prefer the slide whose text best overlaps the most recent sentences of the transcript.
- If there is a clear topical match, pick that slide. If the lecturer just transitioned, prefer the newer slide.
- If nothing matches well (off-topic chatter, noise, or transcript is too short), keep the response but use a low confidence.
- "confidence" is your honest 0..1 estimate of the match quality (1 = obvious match, 0 = no signal).
- Return STRICT JSON only, no markdown fences, with this exact shape:
  {"slideNumber": <integer>, "confidence": <number 0..1>, "reason": "<<=120 chars optional>"}
- "slideNumber" MUST be one of the slide numbers shown in SLIDES.`;

function stripJsonFences(text: string): string {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  return s.trim();
}

function clampConfidence(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function parseMatchJson(raw: string, allowed: Set<number>): SlideMatchResult {
  const s = stripJsonFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(s) as unknown;
  } catch {
    throw new SummarizerError("AI returned invalid JSON for slide match.", 502);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new SummarizerError("AI JSON missing required slide-match fields.", 502);
  }
  const o = parsed as { slideNumber?: unknown; confidence?: unknown; reason?: unknown };
  const sn = Number.parseInt(String(o.slideNumber ?? ""), 10);
  if (!Number.isFinite(sn) || !allowed.has(sn)) {
    throw new SummarizerError("AI returned an out-of-range slide number.", 502);
  }
  const reason =
    typeof o.reason === "string" && o.reason.trim().length > 0
      ? o.reason.trim().slice(0, 120)
      : undefined;
  return { slideNumber: sn, confidence: clampConfidence(o.confidence), reason };
}

function localFallbackMatch(
  deck: DeckSlide[],
  transcript: string,
  currentSlide?: number,
): SlideMatchResult {
  // Cheap word-overlap match for tests / no-key fallback.
  const tail = transcript.slice(-SLIDE_MATCH_TRANSCRIPT_WINDOW).toLowerCase();
  const tailWords = new Set(tail.match(/[a-z][a-z\-']{2,}/g) ?? []);
  let bestN = currentSlide ?? deck[0]?.n ?? 1;
  let bestScore = -1;
  for (const slide of deck) {
    const words = slide.text.toLowerCase().match(/[a-z][a-z\-']{2,}/g) ?? [];
    let overlap = 0;
    for (const w of words) if (tailWords.has(w)) overlap += 1;
    if (overlap > bestScore) {
      bestScore = overlap;
      bestN = slide.n;
    }
  }
  const confidence = bestScore <= 0 ? 0 : Math.min(1, bestScore / 8);
  return { slideNumber: bestN, confidence, reason: "[demo] word-overlap fallback" };
}

/**
 * Pick the slide a lecturer is currently presenting given the deck text and a recent transcript.
 */
export async function matchSlideForTranscript(input: {
  deck: DeckSlide[];
  recentTranscript: string;
  currentSlide?: number;
}): Promise<SlideMatchResult> {
  const deck = input.deck.filter((s) => Number.isFinite(s.n) && s.n >= 1);
  if (deck.length === 0) {
    throw new SummarizerError("Slide deck has no parseable pages.", 400);
  }
  const transcript = input.recentTranscript.replace(/\s+/g, " ").trim();
  const tail =
    transcript.length <= SLIDE_MATCH_TRANSCRIPT_WINDOW
      ? transcript
      : transcript.slice(-SLIDE_MATCH_TRANSCRIPT_WINDOW);
  if (!tail) {
    throw new SummarizerError("No recent transcript yet — keep talking and try again.", 400);
  }

  const window = pickDeckWindow(deck, input.currentSlide);
  const allowed = new Set(window.map((s) => s.n));

  const useTestFallback = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const apiKey = getSlideMatchApiKey();
  if (!apiKey || useTestFallback) {
    if (!useTestFallback) {
      throw new SummarizerError(
        "Slide sync is not configured. Set SLIDESHOW_API_KEY (recommended) or GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY) in .env.",
        503,
      );
    }
    return localFallbackMatch(window, tail, input.currentSlide);
  }

  const slidesBlock = window
    .map((s) => {
      const t = s.text.length > PER_SLIDE_CHAR_CAP ? `${s.text.slice(0, PER_SLIDE_CHAR_CAP)}…` : s.text;
      return `Slide ${s.n}: ${t || "(no extractable text)"}`;
    })
    .join("\n");
  const hint =
    typeof input.currentSlide === "number" && Number.isFinite(input.currentSlide)
      ? `\nPrevious best guess (may be stale): Slide ${input.currentSlide}.`
      : "";
  const userPrompt = `${MATCH_SYSTEM}
${hint}

SLIDES (allowed slide numbers: ${[...allowed].join(", ")}):
${slidesBlock}

TRANSCRIPT (most recent speech, may be partial or noisy):
"""
${tail}
"""

Respond with ONLY the JSON object, no other text.`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: getModelName() });
  try {
    const result = await model.generateContent(userPrompt);
    const text = result.response.text();
    if (!text?.trim()) {
      throw new SummarizerError("AI returned an empty slide-match response.", 502);
    }
    return parseMatchJson(text, allowed);
  } catch (error) {
    if (error instanceof SummarizerError) throw error;
    const rawMsg = error instanceof Error && error.message ? error.message : "Gemini request failed.";
    const quotaOrRate = /429|Too Many Requests|quota exceeded|Quota exceeded|rate.limit/i.test(rawMsg);
    throw new SummarizerError(rawMsg + (quotaOrRate ? " Try again shortly." : ""), quotaOrRate ? 429 : 502);
  }
}
