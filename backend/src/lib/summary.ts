import { GoogleGenerativeAI } from "@google/generative-ai";
import { SummarizerError } from "./errors";

const CHUNK_CHARS = 48_000;

function getGeminiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    undefined
  );
}

function getModelName(): string {
  // `gemini-flash-latest` tracks Google’s stable Flash cutoff; free-tier quotas differ by model name.
  return (process.env.GEMINI_MODEL ?? "gemini-flash-latest").trim();
}

/** Local stub used only in Vitest / tests (no outbound AI calls). */
function localFallbackSummary(texts: string[]): string {
  const merged = texts.join(" ").replace(/\s+/g, " ").trim();
  if (!merged) return "No content available to summarize.";
  const firstChunk = merged.slice(0, 900);
  return `Summary:\n\n${firstChunk}${merged.length > 900 ? "..." : ""}`;
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
export async function summarizeSourceTexts(texts: string[]): Promise<string> {
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

  const summarizeBlock = (block: string, instruction: string) =>
    generateMarkdown(getModelName(), apiKey, `${instruction}\n\n---\n\n${block}`);

  try {
    if (corpus.length <= CHUNK_CHARS) {
      return await summarizeBlock(
        corpus,
        `You summarize classroom lecture transcripts and notes into cohesive study material.
Respond ONLY in Markdown (headings, bullets, bold key terms).

Cover main ideas, definitions, anything the lecturer emphasized as exam-worthy, and 3–5 concrete takeaways.

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
          "Summarize this portion briefly in Markdown-focused bullet notes for a later merge pass.",
        ),
      );
    }

    return await summarizeBlock(
      partials.join("\n\n---\n\n"),
      `Merge partial summaries into one polished Markdown doc for students. Remove redundancy, keep structure.`,
    );
  } catch (error) {
    if (error instanceof SummarizerError) throw error;
    const raw =
      error instanceof Error && error.message ? `Gemini request failed: ${error.message}` : "Gemini request failed.";
    const quotaOrRate =
      /429|Too Many Requests|quota exceeded|Quota exceeded|free_tier|rate.limit/i.test(raw);
    const hint =
      quotaOrRate
        ? " For free tier, try GEMINI_MODEL=gemini-flash-latest (or gemini-1.5-flash), wait for the retry window, or enable billing. See https://ai.google.dev/gemini-api/docs/rate-limits"
        : "";
    throw new SummarizerError(raw + hint, quotaOrRate ? 429 : 502);
  }
}
