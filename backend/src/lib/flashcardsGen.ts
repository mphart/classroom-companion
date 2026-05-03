import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { SummarizerError } from "./errors";

const flashcardCardSchema = z.object({
  term: z.string().min(1),
  definition: z.string().min(1),
});

export const flashcardsDocumentSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1),
  cards: z.array(flashcardCardSchema).min(1),
});

export type FlashcardsDocument = z.infer<typeof flashcardsDocumentSchema>;

function getGeminiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    undefined
  );
}

function getModelName(): string {
  return (process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite").trim();
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  return JSON.parse(candidate) as unknown;
}

const SOURCE_FOCUS = `SOURCE MATERIAL: Classroom notes, transcripts, or slide-extracted text. Prefer instructional content (definitions, concepts, formulas, procedures). Ignore casual chatter when it does not carry teaching content. Do not invent facts not grounded in the material.`;

function flashcardsOutputLanguageClause(label: string | undefined): string {
  const s = label?.trim() ?? "";
  if (!s || /^english$/i.test(s)) return "";
  return `\n\nOUTPUT LANGUAGE (mandatory): The instructional source material is in **${s}**. Write **every** flashcard "term" and "definition" string in **${s}**. JSON keys stay as specified (English identifiers only).`;
}

function localFallbackFlashcards(title: string): FlashcardsDocument {
  return {
    version: 1,
    title,
    cards: [
      { term: "Sample term", definition: "Sample definition from test stub." },
      { term: "Second term", definition: "Second definition from test stub." },
    ],
  };
}

async function generateJsonWithGemini(prompt: string): Promise<unknown> {
  const apiKey = getGeminiKey();
  if (!apiKey) {
    throw new SummarizerError(
      "Flashcards AI is not configured. Set GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY) in backend/.env or root .env.",
      503,
    );
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: getModelName(),
    generationConfig: {
      responseMimeType: "application/json",
    },
  });
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    if (!text?.trim()) throw new Error("empty response");
    return extractJsonObject(text);
  } catch (error) {
    const raw =
      error instanceof Error && error.message ? `Gemini request failed: ${error.message}` : "Gemini request failed.";
    const quotaOrRate =
      /429|Too Many Requests|quota exceeded|Quota exceeded|free_tier|rate.limit/i.test(raw);
    throw new SummarizerError(raw + (quotaOrRate ? " Try another model or wait." : ""), quotaOrRate ? 429 : 502);
  }
}

export function parseFlashcardsDocument(rawText: string): FlashcardsDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    throw new SummarizerError("This note is not a valid flashcard deck (invalid JSON).", 400);
  }
  const out = flashcardsDocumentSchema.safeParse(parsed);
  if (!out.success) {
    throw new SummarizerError("This note is not a valid flashcard deck (schema mismatch).", 400);
  }
  return out.data;
}

export async function generateFlashcardsFromSources(input: {
  texts: string[];
  title: string;
  /** Human-readable label — card text follows this language when not English. */
  outputLanguage?: string;
}): Promise<FlashcardsDocument> {
  const useTestFallback = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  if (useTestFallback) {
    return localFallbackFlashcards(input.title);
  }

  const filtered = input.texts.map((t) => t.trim()).filter(Boolean);
  if (filtered.length === 0) {
    throw new SummarizerError("No text content to build flashcards from.", 400);
  }

  const corpus = filtered.map((t, i) => `### Source ${i + 1}\n${t}`).join("\n\n---\n\n");
  const langExtra = flashcardsOutputLanguageClause(input.outputLanguage);

  const schemaHint = `Return ONLY valid JSON (no markdown outside the JSON object) with this exact shape:
{
  "version": 1,
  "title": string (deck title; may match or refine the requested title),
  "cards": array of objects, each { "term": string, "definition": string }
}

RULES:
- Extract **every substantive key term, concept, formula name, or vocabulary item** that appears clearly in the material and would help a student study.
- Each "term" should be short (typically a few words); "definition" explains it clearly for review (one or more sentences if needed).
- Do **not** duplicate the same concept with trivial wording changes.
- Aim for thorough coverage; if the material is large, you may produce many cards (prefer staying under ~80 cards unless the corpus clearly warrants more).
- Do not invent terms that are not grounded in the sources.`;

  const prompt = `${SOURCE_FOCUS}
${langExtra}

TASK: Build a flashcard deck for exam prep / spaced review from the instructional content below.

${schemaHint}

Requested deck title: ${input.title}

Material:
${corpus}`;

  const parsed = await generateJsonWithGemini(prompt);
  const doc = flashcardsDocumentSchema.safeParse(parsed);
  if (!doc.success) {
    throw new SummarizerError("AI returned flashcards that failed validation. Try again.", 502);
  }
  return doc.data;
}
