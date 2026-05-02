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

export type ConnectDeepgram = (opts: { url: string; apiKey: string }) => WebSocket;

export type TranscriptionDeps = {
  verifyToken: (token: string) => number;
  getDeepgramApiKey: () => string;
  connectDeepgram: ConnectDeepgram;
};

const defaultConnectDeepgram: ConnectDeepgram = ({ url, apiKey }) =>
  new WebSocket(url, {
    headers: {
      Authorization: `Token ${apiKey}`,
    },
  });

function rawDataToBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

export function attachTranscriptionWss(server: http.Server, partial?: Partial<TranscriptionDeps>): WebSocketServer {
  const deps: TranscriptionDeps = {
    verifyToken: partial?.verifyToken ?? defaultVerifyToken,
    getDeepgramApiKey: partial?.getDeepgramApiKey ?? (() => process.env.DEEPGRAM_API_KEY ?? ""),
    connectDeepgram: partial?.connectDeepgram ?? defaultConnectDeepgram,
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

    const apiKey = deps.getDeepgramApiKey().trim();
    if (!apiKey) {
      clientWs.send(JSON.stringify({ type: "error", message: "Deepgram is not configured (DEEPGRAM_API_KEY)." }));
      clientWs.close(1011);
      return;
    }

    let languageOverride: string | undefined;
    let deepgramWs: WebSocket | null = null;
    let forwardedAnyAudio = false;
    const pendingAudio: Buffer[] = [];
    const MAX_PENDING = 300;

    const flushPending = () => {
      if (!deepgramWs || deepgramWs.readyState !== WebSocket.OPEN) return;
      while (pendingAudio.length > 0) {
        const next = pendingAudio.shift();
        if (next) deepgramWs.send(next);
      }
    };

    const closeDeepgram = () => {
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
        try {
          deepgramWs.send(CLOSE_STREAM_PAYLOAD);
        } catch {
          /* ignore */
        }
      }
      deepgramWs?.removeAllListeners();
      try {
        deepgramWs?.close();
      } catch {
        /* ignore */
      }
      deepgramWs = null;
      pendingAudio.length = 0;
    };

    const openDeepgramIfNeeded = () => {
      if (deepgramWs && (deepgramWs.readyState === WebSocket.OPEN || deepgramWs.readyState === WebSocket.CONNECTING)) {
        return;
      }
      const listenUrl = buildListenUrl({ language: languageOverride ?? "en" });
      deepgramWs = deps.connectDeepgram({ url: listenUrl, apiKey });

      deepgramWs.on("open", () => {
        flushPending();
      });

      deepgramWs.on("message", (payload) => {
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

      deepgramWs.on("error", () => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: "error", message: "Deepgram connection error." }));
        }
      });

      deepgramWs.on("close", () => {
        deepgramWs = null;
      });
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
              closeDeepgram();
            }
          } else if (msg.type === "stop") {
            closeDeepgram();
            clientWs.close(1000);
          }
        } catch {
          /* ignore invalid JSON */
        }
        return;
      }

      forwardedAnyAudio = true;
      openDeepgramIfNeeded();
      const buf = rawDataToBuffer(data);
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
        deepgramWs.send(buf);
      } else {
        if (pendingAudio.length >= MAX_PENDING) pendingAudio.shift();
        pendingAudio.push(Buffer.from(buf));
      }
    });

    const cleanup = () => {
      closeDeepgram();
    };

    clientWs.on("close", cleanup);
    clientWs.on("error", cleanup);
  });

  return wss;
}
