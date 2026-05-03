import http from "node:http";
import { EventEmitter } from "node:events";
import WebSocketOrigin, { type WebSocket } from "ws";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { InMemoryRepository } from "../repositories/inMemoryRepository";
import { attachTranscriptionWss } from "../transcription/registerTranscriptionWss";

/**
 * Lightweight fake Deepgram socket — enough for attachTranscriptionWss forwarding tests.
 */
class MockDeepgramSocket extends EventEmitter {
  declare readyState: number;

  constructor(
    private readonly onClientAudio?: (payload: Buffer) => void,
    private readonly onCloseStream?: () => void,
  ) {
    super();
    this.readyState = WebSocketOrigin.CONNECTING;
    queueMicrotask(() => {
      this.readyState = WebSocketOrigin.OPEN;
      this.emit("open");
    });
  }

  send(payload: Buffer | string) {
    if (typeof payload === "string") {
      if (payload.includes("CloseStream")) this.onCloseStream?.();
      return;
    }
    this.onClientAudio?.(Buffer.from(payload));
  }

  close() {
    this.readyState = WebSocketOrigin.CLOSED;
    this.emit("close");
  }

  simulateTranscript(payload: Record<string, unknown>) {
    this.emit("message", Buffer.from(JSON.stringify(payload)));
  }
}

describe("Transcription WebSocket proxy", () => {
  it("streams binary audio to Deepgram and forwards normalized transcripts", async () => {
    const mocks: MockDeepgramSocket[] = [];
    const repo = new InMemoryRepository();
    const app = createApp(repo);
    const server = http.createServer(app);

    attachTranscriptionWss(server, {
      getDeepgramApiKey: () => "test-deepgram-key",
      getGladioApiKey: () => "",
      connectDeepgram: () => {
        const dg = new MockDeepgramSocket((audio) => {
          expect(Buffer.isBuffer(audio)).toBe(true);
          dg.simulateTranscript({
            channel: { alternatives: [{ transcript: "hello from DG" }] },
            is_final: true,
          });
        });
        mocks.push(dg);
        return dg as unknown as WebSocket;
      },
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    const signup = await request(app).post("/auth/signup").send({
      name: "Robin",
      username: `u_${Math.random().toString(36).slice(2, 12)}`,
      password: "password123",
    });
    expect(signup.status).toBe(201);
    const token = signup.body.token as string;

    await new Promise<void>((resolve, reject) => {
      const wsClient = new WebSocketOrigin(`ws://127.0.0.1:${port}/transcription/stream?token=${encodeURIComponent(token)}`);
      wsClient.once("open", () => {
        wsClient.send(JSON.stringify({ type: "configure", language: "en" }));
        wsClient.once("message", (data) => {
          const txt = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
          expect(JSON.parse(txt)).toMatchObject({
            type: "final",
            text: "hello from DG",
          });
          wsClient.close();
          server.close(() => resolve());
        });
        wsClient.send(Buffer.alloc(640, 0));
      });

      wsClient.on("error", reject);
    });
  });

  it("uses Gladia when language is not English", async () => {
    const inits: Array<{ key: string; target: string }> = [];
    const repo = new InMemoryRepository();
    const app = createApp(repo);
    const server = http.createServer(app);

    attachTranscriptionWss(server, {
      getDeepgramApiKey: () => "test-deepgram-key",
      getGladioApiKey: () => "test-gladio-key",
      initGladiaLiveSession: async (key, opts) => {
        inits.push({ key, target: opts.targetLanguageCode });
        return { id: "550e8400-e29b-41d4-a716-446655440000", url: "wss://api.gladia.test/session" };
      },
      connectGladia: () => {
        const g = new MockDeepgramSocket((audio) => {
          expect(Buffer.isBuffer(audio)).toBe(true);
          g.simulateTranscript({
            type: "translation",
            error: null,
            data: {
              translated_utterance: { text: "hola mundo", language: "es", start: 0, end: 1 },
            },
          });
        });
        return g as unknown as WebSocket;
      },
      connectDeepgram: () => {
        throw new Error("Deepgram should not be used for non-English");
      },
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    const signup = await request(app).post("/auth/signup").send({
      name: "Kim",
      username: `u_${Math.random().toString(36).slice(2, 12)}`,
      password: "password123",
    });
    expect(signup.status).toBe(201);
    const token = signup.body.token as string;

    await new Promise<void>((resolve, reject) => {
      const wsClient = new WebSocketOrigin(`ws://127.0.0.1:${port}/transcription/stream?token=${encodeURIComponent(token)}`);
      wsClient.once("open", () => {
        wsClient.send(JSON.stringify({ type: "configure", language: "es" }));
        wsClient.once("message", (data) => {
          const txt = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
          expect(JSON.parse(txt)).toMatchObject({
            type: "final",
            text: "hola mundo",
          });
          expect(inits).toEqual([{ key: "test-gladio-key", target: "es" }]);
          wsClient.close();
          server.close(() => resolve());
        });
        wsClient.send(Buffer.alloc(640, 0));
      });

      wsClient.on("error", reject);
    });
  });
});
