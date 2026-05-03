import type { NormalizedClientTranscript } from "./deepgramLive";

const GLADIA_LIVE_URL = "https://api.gladia.io/v2/live";

/** `GLADIO_API_KEY` / `GLADIA_API_KEY` in env; sent to Gladia as `x-gladia-key` on POST /v2/live. */
export function getGladioApiKey(): string {
  return (process.env.GLADIO_API_KEY ?? process.env.GLADIA_API_KEY ?? "").trim();
}

export type GladiaInitOptions = {
  targetLanguageCode: string;
};

export type GladiaInitResult = {
  url: string;
  id: string;
};

/**
 * Create a short-lived Gladia realtime session; returned `url` is an authenticated WebSocket URL.
 */
export async function initGladiaLiveSession(
  apiKey: string,
  options: GladiaInitOptions,
): Promise<GladiaInitResult> {
  const target = options.targetLanguageCode.trim().toLowerCase();
  if (!target) {
    throw new Error("Gladia session requires a target language code.");
  }

  const body = {
    encoding: "wav/pcm",
    bit_depth: 16,
    sample_rate: 16000,
    channels: 1,
    language_config: {
      languages: [] as string[],
      code_switching: false,
    },
    realtime_processing: {
      translation: true,
      translation_config: {
        target_languages: [target],
        match_original_utterances: true,
        lipsync: false,
        context_adaptation: true,
        informal: false,
      },
    },
    messages_config: {
      receive_partial_transcripts: true,
      receive_final_transcripts: true,
      receive_speech_events: false,
      receive_pre_processing_events: false,
      receive_realtime_processing_events: true,
      receive_post_processing_events: false,
      receive_acknowledgments: false,
      receive_errors: true,
      receive_lifecycle_events: false,
    },
  };

  const res = await fetch(GLADIA_LIVE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-gladia-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`Gladia live init failed (${res.status}): ${rawText || res.statusText}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    throw new Error("Gladia live init returned non-JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Gladia live init returned an invalid body.");
  }

  const obj = parsed as { url?: unknown; id?: unknown };
  const url = typeof obj.url === "string" ? obj.url.trim() : "";
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  if (!url || !id) {
    throw new Error("Gladia live init missing url or id.");
  }

  return { url, id };
}

export const GLADIA_STOP_RECORDING_PAYLOAD = JSON.stringify({ type: "stop_recording" });

type GladiaTranslationPayload = {
  type?: string;
  error?: unknown;
  data?: {
    translated_utterance?: { text?: string; start?: number; end?: number };
  };
};

type GladiaTranscriptPayload = {
  type?: string;
  data?: {
    is_final?: boolean;
    utterance?: { text?: string; start?: number; end?: number };
  };
};

/**
 * Map Gladia WebSocket JSON to the same shape as Deepgram (`partial` / `final`).
 * When `preferTranslation` is true, use `translation` events so text is in the target language.
 */
export function normalizeGladiaServerMessage(
  parsed: unknown,
  preferTranslation: boolean,
): NormalizedClientTranscript | null {
  if (!parsed || typeof parsed !== "object") return null;
  const top = parsed as { type?: string; message?: string };

  if (top.type === "error" && typeof top.message === "string" && top.message.trim()) {
    return null;
  }

  if (preferTranslation) {
    const t = parsed as GladiaTranslationPayload;
    if (t.type === "translation" && t.error == null && t.data?.translated_utterance) {
      const text = typeof t.data.translated_utterance.text === "string" ? t.data.translated_utterance.text.trim() : "";
      if (!text) return null;
      const start = t.data.translated_utterance.start;
      const end = t.data.translated_utterance.end;
      const duration =
        typeof start === "number" && typeof end === "number" && end > start ? end - start : undefined;
      return {
        type: "final",
        text,
        ...(typeof start === "number" ? { start } : {}),
        ...(duration !== undefined ? { duration } : {}),
      };
    }
    return null;
  }

  const tr = parsed as GladiaTranscriptPayload;
  if (tr.type === "transcript" && tr.data?.utterance) {
    const text = typeof tr.data.utterance.text === "string" ? tr.data.utterance.text.trim() : "";
    if (!text) return null;
    const kind: "partial" | "final" = tr.data.is_final ? "final" : "partial";
    const start = tr.data.utterance.start;
    const end = tr.data.utterance.end;
    const duration =
      typeof start === "number" && typeof end === "number" && end > start ? end - start : undefined;
    return {
      type: kind,
      text,
      ...(typeof start === "number" ? { start } : {}),
      ...(duration !== undefined ? { duration } : {}),
    };
  }

  return null;
}

/** Gladia structured errors → short message for the browser when possible. */
export function gladiaErrorMessage(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const top = parsed as { type?: string; message?: string; error?: { message?: string } | null };
  if (top.type === "error" && typeof top.message === "string" && top.message.trim()) {
    return top.message.trim();
  }
  if (top.error && typeof top.error === "object" && typeof top.error.message === "string" && top.error.message.trim()) {
    return top.error.message.trim();
  }
  return null;
}
