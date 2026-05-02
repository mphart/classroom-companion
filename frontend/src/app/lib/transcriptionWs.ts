import { uiLanguageToDeepgramCode } from '@/app/lib/transcriptionLanguage';

/** WebSocket URL for authenticated realtime transcription proxy (PCM linear16 mono 16kHz). */
export function getTranscriptionStreamUrl(token: string): string {
  const trimmedToken = encodeURIComponent(token);
  const explicit = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  let wsOrigin: string;
  if (explicit) {
    wsOrigin = explicit.replace(/\/+$/, '');
  } else {
    const api = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
    if (api) wsOrigin = api.replace(/^http/i, 'ws').replace(/\/+$/, '');
    else {
      /* Docker/nginx: SPA and API share the same host:port (e.g. :8080); Nginx proxies /transcription/stream. */
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      wsOrigin = `${scheme}://${window.location.host}`;
    }
  }
  const path = `/transcription/stream?token=${trimmedToken}`;
  try {
    return new URL(path, `${wsOrigin}/`).toString();
  } catch {
    return `${wsOrigin}${path.startsWith('/') ? path : `/${path}`}`;
  }
}

/** JSON sent immediately after WS open — maps lecture UI language to Deepgram code. */
export function buildConfigureMessage(uiLanguageLabel: string): string {
  return JSON.stringify({
    type: 'configure',
    language: uiLanguageToDeepgramCode(uiLanguageLabel),
  });
}
