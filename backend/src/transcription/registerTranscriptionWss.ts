import http from "node:http";
import { URL } from "node:url";

import WebSocket, { type RawData, WebSocketServer } from "ws";
import { verifyToken as defaultVerifyToken } from "../lib/auth";
import {
  buildListenUrl,
  CLOSE_STREAM_PAYLOAD,
  normalizeDeepgramServerMessage,
  normalizeLanguageCode,
} from "../lib/deepgramLive";
import {
  getGladioApiKey,
  gladiaErrorMessage,
  GLADIA_STOP_RECORDING_PAYLOAD,
  initGladiaLiveSession,
  normalizeGladiaServerMessage,
} from "../lib/gladiaLive";

export type ConnectDeepgram = (opts: { url: string; apiKey: string }) => WebSocket;

export type TranscriptionDeps = {
  verifyToken: (token: string) => number;
  getDeepgramApiKey: () => string;
  getGladioApiKey: () => string;
  connectDeepgram: ConnectDeepgram;
  connectGladia: (url: string) => WebSocket;
  initGladiaLiveSession: typeof initGladiaLiveSession;
};

const defaultConnectDeepgram: ConnectDeepgram = ({ url, apiKey }) =>
  new WebSocket(url, {
    headers: {
      Authorization: `Token ${apiKey}`,
    },
  });

const defaultConnectGladia = (url: string) => new WebSocket(url);

function rawDataToBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

export function attachTranscriptionWss(server: http.Server, partial?: Partial<TranscriptionDeps>): WebSocketServer {
  const deps: TranscriptionDeps = {
    verifyToken: partial?.verifyToken ?? defaultVerifyToken,
    getDeepgramApiKey: partial?.getDeepgramApiKey ?? (() => process.env.DEEPGRAM_API_KEY ?? ""),
    getGladioApiKey: partial?.getGladioApiKey ?? getGladioApiKey,
    connectDeepgram: partial?.connectDeepgram ?? defaultConnectDeepgram,
    connectGladia: partial?.connectGladia ?? defaultConnectGladia,
    initGladiaLiveSession: partial?.initGladiaLiveSession ?? initGladiaLiveSession,
  };

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    try {
      const host = request.headers.host ?? "localhost";
      const url = new URL(request.url ?? "", `http://${host}`);
      if (url.pathname !== "/transcription/stream") {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on("connection", (clientWs, req) => {
    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "", `http://${host}`);
    const token = url.searchParams.get("token");
    if (!token) {
      clientWs.send(JSON.stringify({ type: "error", message: "Missing token query parameter." }));
      clientWs.close(1008, "Missing token");
      return;
    }
    try {
      deps.verifyToken(token);
    } catch {
      clientWs.send(JSON.stringify({ type: "error", message: "Invalid or expired token." }));
      clientWs.close(1008, "Invalid token");
      return;
    }

    let languageOverride: string | undefined;
    let upstreamWs: WebSocket | null = null;
    /** Which provider the current `upstreamWs` belongs to (affects close payload). */
    let upstreamKind: "deepgram" | "gladia" | null = null;
    let gladiaPreferTranslation = false;
    let gladiaInitInFlight = false;
    let forwardedAnyAudio = false;
    const pendingAudio: Buffer[] = [];
    const MAX_PENDING = 300;

    const flushPending = () => {
      if (!upstreamWs || upstreamWs.readyState !== WebSocket.OPEN) return;
      while (pendingAudio.length > 0) {
        const next = pendingAudio.shift();
        if (next) upstreamWs.send(next);
      }
    };

    const closeUpstream = () => {
      if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
        try {
          if (upstreamKind === "gladia") {
            upstreamWs.send(GLADIA_STOP_RECORDING_PAYLOAD);
          } else if (upstreamKind === "deepgram") {
            upstreamWs.send(CLOSE_STREAM_PAYLOAD);
          }
        } catch {
          /* ignore */
        }
      }
      upstreamWs?.removeAllListeners();
      try {
        upstreamWs?.close();
      } catch {
        /* ignore */
      }
      upstreamWs = null;
      upstreamKind = null;
      gladiaInitInFlight = false;
      pendingAudio.length = 0;
    };

    const openDeepgramIfNeeded = (apiKey: string) => {
      if (upstreamWs && (upstreamWs.readyState === WebSocket.OPEN || upstreamWs.readyState === WebSocket.CONNECTING)) {
        return;
      }
      const listenUrl = buildListenUrl({ language: languageOverride ?? "en" });
      upstreamKind = "deepgram";
      gladiaPreferTranslation = false;
      upstreamWs = deps.connectDeepgram({ url: listenUrl, apiKey });

      upstreamWs.on("open", () => {
        flushPending();
      });

      upstreamWs.on("message", (payload) => {
        const raw = Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload);
        try {
          const parsed: unknown = JSON.parse(raw);
          const normalized = normalizeDeepgramServerMessage(parsed);
          if (normalized && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify(normalized));
          }
        } catch {
          /* non-JSON or unknown frame */
        }
      });

      upstreamWs.on("error", () => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: "error", message: "Deepgram connection error." }));
        }
      });

      upstreamWs.on("close", () => {
        upstreamWs = null;
        upstreamKind = null;
      });
    };

    const startGladiaConnection = (apiKey: string, targetCode: string) => {
      if (upstreamWs && (upstreamWs.readyState === WebSocket.OPEN || upstreamWs.readyState === WebSocket.CONNECTING)) {
        return;
      }
      if (gladiaInitInFlight) return;
      gladiaInitInFlight = true;
      void (async () => {
        try {
          const { url } = await deps.initGladiaLiveSession(apiKey, { targetLanguageCode: targetCode });
          if (clientWs.readyState !== WebSocket.OPEN) {
            return;
          }
          upstreamKind = "gladia";
          gladiaPreferTranslation = true;
          upstreamWs = deps.connectGladia(url);

          upstreamWs.on("open", () => {
            flushPending();
          });

          upstreamWs.on("message", (payload) => {
            const raw = Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload);
            try {
              const parsed: unknown = JSON.parse(raw);
              const errMsg = gladiaErrorMessage(parsed);
              if (errMsg && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: "error", message: errMsg }));
                return;
              }
              const normalized = normalizeGladiaServerMessage(parsed, gladiaPreferTranslation);
              if (normalized && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify(normalized));
              }
            } catch {
              /* non-JSON or unknown frame */
            }
          });

          upstreamWs.on("error", () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "error", message: "Gladia connection error." }));
            }
          });

          upstreamWs.on("close", () => {
            upstreamWs = null;
            upstreamKind = null;
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Gladia session failed.";
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: "error", message: msg }));
          }
        } finally {
          gladiaInitInFlight = false;
        }
      })();
    };

    const openUpstreamIfNeeded = () => {
      const lang = (languageOverride ?? "en").toLowerCase();
      if (lang === "en") {
        const dg = deps.getDeepgramApiKey().trim();
        if (!dg) {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: "error", message: "Deepgram is not configured (DEEPGRAM_API_KEY)." }));
          }
          return;
        }
        openDeepgramIfNeeded(dg);
        return;
      }
      const gladiaKey = deps.getGladioApiKey().trim();
      if (!gladiaKey) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: "error",
              message: "Live translation is not configured (GLADIO_API_KEY for Gladia).",
            }),
          );
        }
        return;
      }
      startGladiaConnection(gladiaKey, lang);
    };

    clientWs.on("message", (data, isBinary) => {
      if (clientWs.readyState !== WebSocket.OPEN) return;
      if (!isBinary) {
        try {
          const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
          const msg = JSON.parse(text) as { type?: string; language?: string };
          if (msg.type === "configure") {
            if (!forwardedAnyAudio) {
              const code = normalizeLanguageCode(msg.language);
              if (code) languageOverride = code;
              closeUpstream();
            }
          } else if (msg.type === "stop") {
            closeUpstream();
            clientWs.close(1000);
          }
        } catch {
          /* ignore invalid JSON */
        }
        return;
      }

      forwardedAnyAudio = true;
      openUpstreamIfNeeded();
      const buf = rawDataToBuffer(data);
      if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.send(buf);
      } else {
        if (pendingAudio.length >= MAX_PENDING) pendingAudio.shift();
        pendingAudio.push(Buffer.from(buf));
      }
    });

    const cleanup = () => {
      closeUpstream();
    };

    clientWs.on("close", cleanup);
    clientWs.on("error", cleanup);
  });

  return wss;
}
