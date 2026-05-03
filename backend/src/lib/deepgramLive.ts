const DEEPGRAM_WS_BASE = process.env.DEEPGRAM_WS_HOST ?? "wss://api.deepgram.com";

export type ListenUrlOptions = {
  language?: string;
  model?: string;
  endpointingMs?: number;
};

export type TranscriptWordToken = {
  word: string;
  /** Deepgram confidence 0–1 */
  confidence: number;
};

export type NormalizedClientTranscript = {
  type: "partial" | "final";
  text: string;
  /** Present when Deepgram is called with `words=true` (per-word confidence). */
  words?: TranscriptWordToken[];
  start?: number;
  duration?: number;
};

/** Build Deepgram v1 realtime listen URL for raw PCM (linear16 mono 16000 Hz). */
export function buildListenUrl(options: ListenUrlOptions = {}): string {
  const model = options.model ?? process.env.DG_MODEL ?? "nova-2";
  const endpointing = options.endpointingMs ?? Number(process.env.DG_ENDPOINTING_MS ?? 300);
  const language = options.language ?? "en";
  const params = new URLSearchParams({
    model,
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    interim_results: "true",
    smart_format: "true",
    punctuate: "true",
    words: "true",
    language,
  });
  if (!Number.isNaN(endpointing) && endpointing > 0) {
    params.set("endpointing", String(endpointing));
  }
  const base = DEEPGRAM_WS_BASE.replace(/\/?$/, "");
  return `${base}/v1/listen?${params.toString()}`;
}

/** Map UI language names (and ISO-ish codes) to Deepgram-compatible language codes. */
export function normalizeLanguageCode(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim().length === 0) return undefined;
  const s = raw.trim();
  const lower = s.toLowerCase();
  const nameMap: Record<string, string> = {
    english: "en",
    spanish: "es",
    french: "fr",
    german: "de",
    mandarin: "zh",
    "chinese mandarin": "zh",
    chinese: "zh",
    portuguese: "pt",
    italian: "it",
    japanese: "ja",
    korean: "ko",
  };
  if (nameMap[lower]) return nameMap[lower];
  /* already a likely code like "en" or "en-US" */
  return s.includes("-") || s.length <= 5 ? lower : undefined;
}

type DeepgramWord = {
  word?: string;
  punctuated_word?: string;
  confidence?: number;
};

type DeepgramAlternative = { transcript?: string; words?: DeepgramWord[]; confidence?: number };

type DeepgramChannel = {
  alternatives?: DeepgramAlternative[];
};

type DeepgramResultLike = {
  type?: string;
  channel?: DeepgramChannel;
  /** Some responses use `channels[]` instead of `channel` (multichannel / newer payloads). */
  channels?: DeepgramChannel[];
  is_final?: boolean;
  start?: number;
  duration?: number;
};

/** Pick the primary alternative from a Deepgram streaming JSON frame. */
export function pickDeepgramFirstAlternative(parsed: unknown): DeepgramAlternative | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const obj = parsed as DeepgramResultLike;
  const fromChannel = obj.channel?.alternatives?.[0];
  if (fromChannel && typeof fromChannel.transcript === "string") {
    return fromChannel;
  }
  const ch0 = Array.isArray(obj.channels) ? obj.channels[0] : undefined;
  const fromChannels = ch0?.alternatives?.[0];
  if (fromChannels && typeof fromChannels.transcript === "string") {
    return fromChannels;
  }
  return undefined;
}

function readConfidence(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 1;
}

function extractWordTokens(alt: { words?: DeepgramWord[] } | undefined): TranscriptWordToken[] | undefined {
  const raw = alt?.words;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: TranscriptWordToken[] = [];
  for (const w of raw) {
    const text =
      typeof w.punctuated_word === "string" && w.punctuated_word.length > 0
        ? w.punctuated_word
        : typeof w.word === "string"
          ? w.word
          : "";
    if (!text.trim()) continue;
    out.push({ word: text, confidence: readConfidence(w.confidence) });
  }
  return out.length > 0 ? out : undefined;
}

/** Turn a Deepgram server JSON payload into normalized browser messages; null if irrelevant. */
export function normalizeDeepgramServerMessage(parsed: unknown): NormalizedClientTranscript | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as DeepgramResultLike;
  if (obj.type === "Metadata") {
    return null;
  }
  const alt = pickDeepgramFirstAlternative(parsed);
  const transcript = typeof alt?.transcript === "string" ? alt.transcript : "";
  if (!transcript.trim()) return null;
  const kind: "partial" | "final" = obj.is_final ? "final" : "partial";
  const words = extractWordTokens(alt);
  return {
    type: kind,
    text: transcript,
    ...(words ? { words } : {}),
    ...(typeof obj.start === "number" ? { start: obj.start } : {}),
    ...(typeof obj.duration === "number" ? { duration: obj.duration } : {}),
  };
}

export const CLOSE_STREAM_PAYLOAD = JSON.stringify({ type: "CloseStream" });
