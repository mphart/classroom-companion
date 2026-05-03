import { GoogleGenerativeAI } from "@google/generative-ai";
import { SummarizerError } from "./errors";

/** Recent transcript window sent to the model (chars). */
export const SESSION_QA_TRANSCRIPT_WINDOW = 8000;

function getGeminiKey(): string | undefined {
  return (
    process.env.TA_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    undefined
  );
}

function getModelName(): string {
  return (process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite").trim();
}

function answerLanguageClause(label: string | undefined): string {
  const s = label?.trim() ?? "";
  if (!s || /^english$/i.test(s)) return "";
  return `\n\nANSWER LANGUAGE (mandatory): Respond entirely in **${s}**. Do not use English except for technical terms normally kept in English in ${s}-language classrooms.`;
}

const SESSION_SYSTEM = `You are a teaching assistant helping a student during a LIVE lecture. You only know what appears in the TRANSCRIPT excerpt below (recent speech-to-text from the classroom).

RULES:
- Answer the student's question using ONLY information that is clearly supported by the transcript. Prefer instructor-led explanations over casual student chatter.
- If the transcript does not contain enough information to answer, say so briefly and suggest what to listen for next — do not invent lecture content.
- Keep answers concise (roughly 3–8 sentences unless the question needs a short list). Use Markdown sparingly (bold for key terms only if helpful).
- This is NOT a general chatbot: do not use outside knowledge except to clarify standard terminology that appears in the transcript.`;

function localFallbackAnswer(question: string): string {
  return `[Demo mode] Based only on the transcript snippet you sent, here’s a concise placeholder answer for: "${question.slice(0, 80)}${question.length > 80 ? "…" : ""}"`;
}

/**
 * Ask a question against the recent live-transcript window (Gemini).
 */
export async function answerSessionQuestion(input: {
  transcript: string;
  question: string;
  language?: string;
}): Promise<string> {
  const question = input.question.trim();
  if (!question) {
    throw new SummarizerError("Question is required.", 400);
  }

  const raw = input.transcript.replace(/\s+/g, " ").trim();
  const tail = raw.length <= SESSION_QA_TRANSCRIPT_WINDOW ? raw : raw.slice(-SESSION_QA_TRANSCRIPT_WINDOW);
  if (!tail) {
    throw new SummarizerError("No transcript yet — start speaking or wait for captions before asking.", 400);
  }

  const useTestFallback = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const apiKey = getGeminiKey();

  if (!apiKey || useTestFallback) {
    if (!useTestFallback) {
      throw new SummarizerError(
        "AI is not configured. Set TA_API_KEY (or GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY) in backend/.env.",
        503,
      );
    }
    return localFallbackAnswer(question);
  }

  const langExtra = answerLanguageClause(input.language);
  const userPrompt = `${SESSION_SYSTEM}
${langExtra}

TRANSCRIPT (recent, may be partial or noisy):
"""
${tail}
"""

STUDENT QUESTION:
${question}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: getModelName() });
  try {
    const result = await model.generateContent(userPrompt);
    const text = result.response.text();
    if (!text?.trim()) {
      throw new SummarizerError("AI returned an empty answer.", 502);
    }
    return text.trim();
  } catch (error) {
    if (error instanceof SummarizerError) throw error;
    const rawMsg = error instanceof Error && error.message ? error.message : "Gemini request failed.";
    const quotaOrRate = /429|Too Many Requests|quota exceeded|Quota exceeded|rate.limit/i.test(rawMsg);
    throw new SummarizerError(rawMsg + (quotaOrRate ? " Try again shortly." : ""), quotaOrRate ? 429 : 502);
  }
}
