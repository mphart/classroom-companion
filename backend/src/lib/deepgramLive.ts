const DEEPGRAM_WS_BASE = process.env.DEEPGRAM_WS_HOST ?? "wss://api.deepgram.com";

export type ListenUrlOptions = {
  language?: string;
  model?: string;
  endpointingMs?: number;
};

export type NormalizedClientTranscript = {
  type: "partial" | "final";
  text: string;
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

type DeepgramChannel = {
  alternatives?: Array<{ transcript?: string }>;
};

type DeepgramResultLike = {
  type?: string;
  channel?: DeepgramChannel;
  is_final?: boolean;
  start?: number;
  duration?: number;
};

/** Turn a Deepgram server JSON payload into normalized browser messages; null if irrelevant. */
export function normalizeDeepgramServerMessage(parsed: unknown): NormalizedClientTranscript | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as DeepgramResultLike;
  /* Metadata / heartbeat style messages */
  const transcript =
    typeof obj.channel?.alternatives?.[0]?.transcript === "string" ? obj.channel.alternatives[0].transcript : "";
  if (!transcript.trim()) return null;
  const kind: "partial" | "final" = obj.is_final ? "final" : "partial";
  return {
    type: kind,
    text: transcript,
    ...(typeof obj.start === "number" ? { start: obj.start } : {}),
    ...(typeof obj.duration === "number" ? { duration: obj.duration } : {}),
  };
}

export const CLOSE_STREAM_PAYLOAD = JSON.stringify({ type: "CloseStream" });
