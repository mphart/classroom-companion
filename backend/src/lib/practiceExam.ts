import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { SummarizerError } from "./errors";

const INSTRUCTOR_FOCUS = `SOURCE MATERIAL: Classroom notes/transcripts. Audio may include instructor lecture plus student chatter.
- Base questions ONLY on clear instructional content (definitions, procedures, exam hints, worked examples).
- Ignore casual student conversation and off-topic noise.
- Do not invent facts not grounded in the material.`;

/** Gemini key used only for practice exam generation and grading (not summaries). */
function getPracticeExamApiKey(): string | undefined {
  return process.env.PRACTICE_API_KEY?.trim() || undefined;
}

/** Same env as summaries; default Flash-Lite for throughput-friendly quotas. */
function getModelName(): string {
  return (process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite").trim();
}

export const examMcQuestionSchema = z.object({
  type: z.literal("multiple_choice"),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(8),
  correctIndex: z.number().int().min(0),
  explanation: z.string().optional(),
});

export const examSaQuestionSchema = z.object({
  type: z.literal("short_answer"),
  prompt: z.string().min(1),
  referenceAnswer: z.string().min(1),
});

export const examQuestionSchema = z.discriminatedUnion("type", [examMcQuestionSchema, examSaQuestionSchema]);

export const examDocumentSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1),
  questions: z.array(examQuestionSchema).min(1),
});

export type ExamDocument = z.infer<typeof examDocumentSchema>;
export type ExamQuestion = z.infer<typeof examQuestionSchema>;

const gradeResultItemSchema = z.object({
  questionIndex: z.number().int().min(0),
  verdict: z.enum(["correct", "partial", "incorrect"]),
  feedback: z.string().min(1),
});

const gradeResponseSchema = z.object({
  results: z.array(gradeResultItemSchema).min(0),
});

export type GradeResultItem = z.infer<typeof gradeResultItemSchema>;

export function parseExamDocument(rawText: string): ExamDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    throw new SummarizerError("This note is not a valid practice exam (invalid JSON).", 400);
  }
  const out = examDocumentSchema.safeParse(parsed);
  if (!out.success) {
    throw new SummarizerError("This note is not a valid practice exam (schema mismatch).", 400);
  }
  for (const q of out.data.questions) {
    if (q.type === "multiple_choice" && q.correctIndex >= q.options.length) {
      throw new SummarizerError("Practice exam data is invalid (MC index out of range).", 400);
    }
  }
  return out.data;
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  return JSON.parse(candidate) as unknown;
}

function examOutputLanguageClause(label: string | undefined): string {
  const s = label?.trim() ?? "";
  if (!s || /^english$/i.test(s)) return "";
  return `\n\nOUTPUT LANGUAGE (mandatory): The instructional source material is in **${s}**. Write the **entire** practice exam JSON in **${s}** — "title", every question "prompt", every multiple-choice "option" and "explanation", and every short_answer "prompt" and "referenceAnswer". Use ${s} only for those strings; do not write exam content in English unless it is a technical term normally left in English in ${s}-language teaching contexts. JSON keys stay as specified by the schema (English identifiers only).`;
}

function gradingFeedbackLanguageClause(label: string | undefined): string {
  const s = label?.trim() ?? "";
  if (!s || /^english$/i.test(s)) return "";
  return `\n\nFEEDBACK LANGUAGE (mandatory): The exam is written in **${s}**. Write every "feedback" string in **${s}** so help text matches the exam language.`;
}

function countsForConfig(input: {
  questionCount: number;
  includeMultipleChoice: boolean;
  includeShortAnswer: boolean;
}): { mc: number; sa: number } {
  const { questionCount, includeMultipleChoice, includeShortAnswer } = input;
  if (includeMultipleChoice && includeShortAnswer) {
    const mc = Math.ceil(questionCount / 2);
    return { mc, sa: questionCount - mc };
  }
  if (includeMultipleChoice) return { mc: questionCount, sa: 0 };
  return { mc: 0, sa: questionCount };
}

function localFallbackExam(input: {
  title: string;
  questionCount: number;
  includeMultipleChoice: boolean;
  includeShortAnswer: boolean;
}): ExamDocument {
  const { mc, sa } = countsForConfig(input);
  const questions: ExamQuestion[] = [];
  let n = 0;
  for (let i = 0; i < mc; i++) {
    n += 1;
    questions.push({
      type: "multiple_choice",
      prompt: `Test question ${n} (multiple choice): What is 2+2?`,
      options: ["3", "4", "5", "22"],
      correctIndex: 1,
      explanation: "Four is correct.",
    });
  }
  for (let i = 0; i < sa; i++) {
    n += 1;
    questions.push({
      type: "short_answer",
      prompt: `Test question ${n} (short answer): Name a primary color.`,
      referenceAnswer: "Red, blue, or yellow.",
    });
  }
  return { version: 1, title: input.title, questions };
}

function localFallbackGrade(
  exam: ExamDocument,
  responses: { questionIndex: number; answer: string }[],
): GradeResultItem[] {
  return responses.map((r) => {
    const q = exam.questions[r.questionIndex];
    if (!q || q.type !== "short_answer") {
      return { questionIndex: r.questionIndex, verdict: "incorrect" as const, feedback: "Not a short-answer question." };
    }
    const ans = r.answer.trim().toLowerCase();
    if (ans.length === 0) {
      return { questionIndex: r.questionIndex, verdict: "incorrect" as const, feedback: "No answer provided." };
    }
    if (ans.includes("red") || ans.includes("blue") || ans.includes("yellow")) {
      return { questionIndex: r.questionIndex, verdict: "correct" as const, feedback: "Matches expected primary colors." };
    }
    return { questionIndex: r.questionIndex, verdict: "partial" as const, feedback: "Stub grader: mention a primary color." };
  });
}

async function generateJsonWithGemini(prompt: string): Promise<unknown> {
  const apiKey = getPracticeExamApiKey();
  if (!apiKey) {
    throw new SummarizerError(
      "Practice exam AI is not configured. Set PRACTICE_API_KEY (Gemini) in backend/.env or root .env (see Docker Compose).",
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

export async function generatePracticeExamFromSources(input: {
  texts: string[];
  title: string;
  questionCount: number;
  includeMultipleChoice: boolean;
  includeShortAnswer: boolean;
  otherInstructions?: string;
  /** Human-readable label (e.g. Spanish) — entire exam content follows this language when not English. */
  outputLanguage?: string;
}): Promise<ExamDocument> {
  const { mc, sa } = countsForConfig(input);
  if (mc + sa !== input.questionCount) {
    throw new SummarizerError("Invalid question mix.", 400);
  }

  const useTestFallback = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  if (useTestFallback) {
    return localFallbackExam({
      title: input.title,
      questionCount: input.questionCount,
      includeMultipleChoice: input.includeMultipleChoice,
      includeShortAnswer: input.includeShortAnswer,
    });
  }

  const filtered = input.texts.map((t) => t.trim()).filter(Boolean);
  if (filtered.length === 0) {
    throw new SummarizerError("No text content to build an exam from.", 400);
  }

  const corpus = filtered.map((t, i) => `### Source ${i + 1}\n${t}`).join("\n\n---\n\n");
  const other = input.otherInstructions?.trim() ? `\nExtra instructions from the student: ${input.otherInstructions.trim()}` : "";
  const langExtra = examOutputLanguageClause(input.outputLanguage);

  const schemaHint = `Return ONLY valid JSON (no markdown) with this exact shape:
{
  "version": 1,
  "title": string (exam title, can match or refine the requested title),
  "questions": array of length exactly ${input.questionCount},
}

Each question object is EITHER:
{ "type": "multiple_choice", "prompt": string, "options": string[] (4 options), "correctIndex": number (0-based), "explanation": string (why the answer is correct) }
OR
{ "type": "short_answer", "prompt": string, "referenceAnswer": string (ideal answer for grading) }

You MUST include exactly ${mc} multiple_choice question(s) and exactly ${sa} short_answer question(s), in any order.
For multiple_choice, correctIndex must be valid for options.length.`;

  const prompt = `${INSTRUCTOR_FOCUS}
${langExtra}

TASK: Write a practice exam for students based on the instructional content below.
${schemaHint}
${other}

Requested exam title: ${input.title}

Material:
${corpus}`;

  const parsed = await generateJsonWithGemini(prompt);
  const doc = examDocumentSchema.safeParse(parsed);
  if (!doc.success) {
    throw new SummarizerError("AI returned an exam that failed validation. Try again.", 502);
  }
  const data = doc.data;
  if (data.questions.length !== input.questionCount) {
    throw new SummarizerError("AI returned the wrong number of questions. Try again.", 502);
  }
  let mcGot = 0;
  let saGot = 0;
  for (const q of data.questions) {
    if (q.type === "multiple_choice") mcGot += 1;
    else saGot += 1;
  }
  if (mcGot !== mc || saGot !== sa) {
    throw new SummarizerError("AI returned the wrong mix of question types. Try again.", 502);
  }
  for (const q of data.questions) {
    if (q.type === "multiple_choice" && q.correctIndex >= q.options.length) {
      throw new SummarizerError("AI returned an invalid multiple-choice key. Try again.", 502);
    }
  }
  return data;
}

export async function gradeShortAnswers(input: {
  exam: ExamDocument;
  responses: { questionIndex: number; answer: string }[];
  /** Stored exam note language — grading feedback matches when not English. */
  feedbackLanguage?: string;
}): Promise<GradeResultItem[]> {
  const useTestFallback = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  if (useTestFallback) {
    return localFallbackGrade(input.exam, input.responses);
  }

  if (input.responses.length === 0) return [];

  const apiKey = getPracticeExamApiKey();
  if (!apiKey) {
    throw new SummarizerError(
      "Practice exam AI is not configured. Set PRACTICE_API_KEY (Gemini) in backend/.env or root .env (see Docker Compose).",
      503,
    );
  }

  const lines = input.responses.map((r) => {
    const q = input.exam.questions[r.questionIndex];
    if (!q || q.type !== "short_answer") {
      return `Index ${r.questionIndex}: (not a short_answer question) student: ${JSON.stringify(r.answer)}`;
    }
    return `Index ${r.questionIndex}:\nQuestion: ${q.prompt}\nReference: ${q.referenceAnswer}\nStudent answer: ${r.answer || "(empty)"}`;
  });

  const feedbackLang = gradingFeedbackLanguageClause(input.feedbackLanguage);

  const prompt = `${INSTRUCTOR_FOCUS}

You are grading short-answer responses. For each item, compare the student answer to the reference fairly (synonyms and paraphrases can be correct).
${feedbackLang}

Return ONLY valid JSON:
{
  "results": [
    { "questionIndex": number, "verdict": "correct" | "partial" | "incorrect", "feedback": string }
  ]
}

Include one result per input item, same questionIndex values, brief feedback (1-3 sentences).

Items to grade:
${lines.join("\n\n---\n\n")}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: getModelName(),
    generationConfig: { responseMimeType: "application/json" },
  });
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    if (!text?.trim()) throw new Error("empty response");
    const parsed = extractJsonObject(text);
    const out = gradeResponseSchema.safeParse(parsed);
    if (!out.success) throw new Error("invalid grade shape");
    const byIndex = new Map(out.data.results.map((x) => [x.questionIndex, x]));
    return input.responses.map((r) => {
      const g = byIndex.get(r.questionIndex);
      if (g) return g;
      return { questionIndex: r.questionIndex, verdict: "incorrect" as const, feedback: "Could not grade this response." };
    });
  } catch (error) {
    const raw =
      error instanceof Error && error.message ? `Gemini grading failed: ${error.message}` : "Gemini grading failed.";
    throw new SummarizerError(raw, 502);
  }
}
