import { GoogleGenerativeAI } from "@google/generative-ai";
import { SummarizerError } from "./errors";

const CHUNK_CHARS = 48_000;

/** Matches Gemini / Google quota, rate limit, and resource-exhausted style errors. */
const GEMINI_RATE_OR_QUOTA_RE =
  /429|Too Many Requests|quota exceeded|Quota exceeded|free_tier|rate.limit|resource.exhausted|RESOURCE_EXHAUSTED/i;

/** True when summarization failed due to rate limits or quota (safe to retry later; transcript-only note is OK). */
export function isGeminiSummarizeRateLimited(error: unknown): boolean {
  if (error instanceof SummarizerError && error.statusCode === 429) return true;
  const msg = error instanceof Error ? error.message : String(error);
  return GEMINI_RATE_OR_QUOTA_RE.test(msg);
}

function getGeminiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    undefined
  );
}

function getModelName(): string {
  // Default `gemini-2.5-flash-lite`: cost-efficient, higher throughput / friendlier rate limits than full Flash.
  return (process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite").trim();
}

/** Local stub used only in Vitest / tests (no outbound AI calls). */
function localFallbackSummary(texts: string[]): string {
  const merged = texts.join(" ").replace(/\s+/g, " ").trim();
  if (!merged) return "No content available to summarize.";
  const firstChunk = merged.slice(0, 900);
  return `Summary:\n\n${firstChunk}${merged.length > 900 ? "..." : ""}`;
}

/**
 * Speech-to-text often captures the whole room. Summaries should reflect instructor-led teaching only.
 */
const INSTRUCTOR_FOCUS_INSTRUCTIONS = `INPUT: Raw transcript(s) from a live class. Audio may include BOTH:
- The **professor / primary instructor** (lecture, explanations, examples, assignments, exam guidance)
- **Students and others** (questions, side conversation, group talk, laughter, overlapping speech, or noise mis-heard as words)

RULES FOR WHAT TO INCLUDE IN THE SUMMARY:
- **Include** instructional content: definitions, derivations, procedures, worked examples, frameworks, dates/deadlines the instructor states, “this will be on the exam”, key takeaways, and answers the instructor gives to the class.
- **Exclude** casual student chat, off-topic banter, private conversations, filler (“yeah”, “lol”), and rambling that does not advance the lesson—unless the instructor explicitly uses it to teach.
- When it is unclear who is speaking, **prefer** segments that sound like structured teaching (definitions, numbered lists, “the important point is…”) over informal back-and-forth.
- **Do not invent** facts; only summarize what is clearly tied to the lesson in the text.
- If the transcript is mostly non-instructional noise, say so briefly in one short note, then list only the real instructional content you can find.`;

export type SummarizeOptions = {
  /** Human-readable label (e.g. note `language` / UI dropdown) to steer Gemini output language. */
  outputLanguage?: string;
};

function outputLanguageClause(label: string | undefined): string {
  const s = label?.trim() ?? "";
  if (!s || /^english$/i.test(s)) return "";
  return `\n\nOUTPUT LANGUAGE (mandatory): The lecture notes below are in **${s}**. Write the **entire** summary in **${s}** only — every heading, bullet, bold label, and sentence. Do not use English. If a technical term is normally kept in English in ${s} prose, you may keep that term in English.`;
}

async function generateMarkdown(modelName: string, apiKey: string, userPrompt: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(userPrompt);
  const text = result.response.text();
  if (!text?.trim()) {
    throw new SummarizerError("Gemini returned an empty summary.", 502);
  }
  return text.trim();
}

/**
 * Turn one or many note bodies into Markdown study notes.
 * Uses Google Gemini when `GEMINI_API_KEY` is set; uses a tiny local stub during tests only.
 */
export async function summarizeSourceTexts(texts: string[], options?: SummarizeOptions): Promise<string> {
  const filtered = texts.map((t) => t.trim()).filter(Boolean);
  if (filtered.length === 0) {
    throw new SummarizerError("No text content to summarize.", 400);
  }

  const useTestFallback = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const apiKey = getGeminiKey();

  if (!apiKey || useTestFallback) {
    if (!useTestFallback) {
      throw new SummarizerError(
        "AI is not configured. Set GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY) in backend/.env with your Gemini API key.",
        503,
      );
    }
    return localFallbackSummary(filtered);
  }

  const corpus = filtered.map((t, i) => `### Source ${i + 1}\n${t}`).join("\n\n---\n\n");
  const langExtra = outputLanguageClause(options?.outputLanguage);

  const summarizeBlock = (block: string, instruction: string) =>
    generateMarkdown(getModelName(), apiKey, `${instruction}${langExtra}\n\n---\n\n${block}`);

  try {
    if (corpus.length <= CHUNK_CHARS) {
      return await summarizeBlock(
        corpus,
        `${INSTRUCTOR_FOCUS_INSTRUCTIONS}

TASK: Turn the instructional parts of the material below into cohesive student study notes.
Respond ONLY in Markdown (headings, bullets, bold key terms).

Cover main ideas, definitions, anything the instructor emphasized as exam-worthy, and 3–5 concrete takeaways.
Ignore non-instructional chatter per the rules above.

Material to summarize:`,
      );
    }

    const chunks: string[] = [];
    for (let i = 0; i < corpus.length; i += CHUNK_CHARS) {
      chunks.push(corpus.slice(i, i + CHUNK_CHARS));
    }

    const partials: string[] = [];
    for (const chunk of chunks) {
      partials.push(
        await summarizeBlock(
          chunk,
          `${INSTRUCTOR_FOCUS_INSTRUCTIONS}

Summarize ONLY the professor/instructor-led teaching in this portion. Omit student small talk and off-topic lines.
Output brief Markdown bullet notes for a later merge pass (no preamble).`,
        ),
      );
    }

    return await summarizeBlock(
      partials.join("\n\n---\n\n"),
      `${INSTRUCTOR_FOCUS_INSTRUCTIONS}

Merge the partial notes below into one polished Markdown study guide for students.
Remove redundancy; keep only instructor-relevant content; drop any stray chatter that slipped through.`,
    );
  } catch (error) {
    if (error instanceof SummarizerError) throw error;
    const raw =
      error instanceof Error && error.message ? `Gemini request failed: ${error.message}` : "Gemini request failed.";
    const quotaOrRate = GEMINI_RATE_OR_QUOTA_RE.test(raw);
    const hint =
      quotaOrRate
        ? " For free tier, try GEMINI_MODEL=gemini-2.5-flash-lite (or gemini-1.5-flash), wait for the retry window, or enable billing. See https://ai.google.dev/gemini-api/docs/rate-limits"
        : "";
    throw new SummarizerError(raw + hint, quotaOrRate ? 429 : 502);
  }
}
