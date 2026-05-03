import { GoogleGenerativeAI } from "@google/generative-ai";
import { SummarizerError } from "./errors";

export type JargonTerm = { term: string; definition: string };

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

function definitionLanguageClause(label: string | undefined): string {
  const s = label?.trim() ?? "";
  if (!s || /^english$/i.test(s)) return "";
  return `\n\nDEFINITION LANGUAGE (mandatory): Write every "definition" entirely in **${s}**. Keep canonical technical terms in the usual form for ${s}-language classrooms when appropriate.`;
}

const JARGON_SYSTEM = `You are listening to a live university lecture. Identify DOMAIN-SPECIFIC JARGON — technical subject terms a student unfamiliar with the field would need defined.

Rules:
- Only include terms ACTUALLY USED or clearly implied in the TRANSCRIPT CHUNK below.
- Exclude common English words, filler, names of people/places.
- Exclude anything listed in ALREADY_FLAGGED (case-insensitive match on the term phrase).
- One-sentence definition (at most 25 words), intro-level, technically accurate.
- Prefer canonical noun phrases (e.g. "tangent line", not a lone "tangent" unless the chunk only uses "tangent" as the established term).
- Return STRICT JSON only, no markdown outside the JSON object, with this exact shape:
  {"terms":[{"term":"string","definition":"string"}, ...]}
- If there are no suitable terms, return {"terms":[]}.`;

function stripJsonFences(text: string): string {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  return s.trim();
}

function parseTermsJson(raw: string): JargonTerm[] {
  const s = stripJsonFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(s) as unknown;
  } catch {
    throw new SummarizerError("AI returned invalid JSON for jargon extraction.", 502);
  }
  if (!parsed || typeof parsed !== "object" || !("terms" in parsed)) {
    throw new SummarizerError("AI JSON missing required 'terms' array.", 502);
  }
  const termsRaw = (parsed as { terms: unknown }).terms;
  if (!Array.isArray(termsRaw)) {
    throw new SummarizerError("AI JSON 'terms' must be an array.", 502);
  }
  const out: JargonTerm[] = [];
  for (const item of termsRaw) {
    if (!item || typeof item !== "object") continue;
    const o = item as { term?: unknown; definition?: unknown };
    const term = typeof o.term === "string" ? o.term.trim() : "";
    const definition = typeof o.definition === "string" ? o.definition.trim() : "";
    if (!term || !definition) continue;
    if (term.length > 200 || definition.length > 800) continue;
    out.push({ term, definition });
  }
  return out;
}

function localFallbackTerms(chunkText: string): JargonTerm[] {
  const lower = chunkText.toLowerCase();
  const terms: JargonTerm[] = [];
  if (/\bderivative\b/.test(lower)) {
    terms.push({
      term: "derivative",
      definition: "[Demo mode] Rate of change of a function with respect to its variable.",
    });
  }
  if (/\blimit\b/.test(lower)) {
    terms.push({
      term: "limit",
      definition: "[Demo mode] Value a function approaches as the input approaches some point.",
    });
  }
  return terms;
}

/**
 * Extract domain jargon from a recent transcript chunk (Gemini).
 */
export async function extractJargonTerms(input: {
  chunkText: string;
  alreadyFlagged: string[];
  language?: string;
}): Promise<{ terms: JargonTerm[] }> {
  const chunk = input.chunkText.replace(/\s+/g, " ").trim();
  if (!chunk) {
    throw new SummarizerError("Transcript chunk is empty.", 400);
  }

  const flagged = input.alreadyFlagged
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
  const flaggedLine = flagged.length > 0 ? flagged.join(", ") : "(none)";

  const useTestFallback = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const apiKey = getGeminiKey();

  if (!apiKey || useTestFallback) {
    if (!useTestFallback) {
      throw new SummarizerError(
        "AI is not configured. Set GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY) in backend/.env.",
        503,
      );
    }
    return { terms: localFallbackTerms(chunk) };
  }

  const langExtra = definitionLanguageClause(input.language);
  const userPrompt = `${JARGON_SYSTEM}
${langExtra}

ALREADY_FLAGGED: ${flaggedLine}

TRANSCRIPT CHUNK:
"""
${chunk}
"""

Respond with ONLY the JSON object, no other text.`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: getModelName() });
  try {
    const result = await model.generateContent(userPrompt);
    const text = result.response.text();
    if (!text?.trim()) {
      return { terms: [] };
    }
    const terms = parseTermsJson(text);
    return { terms };
  } catch (error) {
    if (error instanceof SummarizerError) throw error;
    const rawMsg = error instanceof Error && error.message ? error.message : "Gemini request failed.";
    const quotaOrRate = /429|Too Many Requests|quota exceeded|Quota exceeded|rate.limit/i.test(rawMsg);
    throw new SummarizerError(rawMsg + (quotaOrRate ? " Try again shortly." : ""), quotaOrRate ? 429 : 502);
  }
}
