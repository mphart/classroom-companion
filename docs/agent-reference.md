# Agent reference — implementation context

This document summarizes **architecture, env, Docker, speech-to-text, and common pitfalls** so future agents (or humans) can work on the repo without re-deriving context from chat logs.

Product and UX specs live in [`design-doc.md`](design-doc.md) and [`pages/`](pages/). **HTTP/WebSocket contracts** are in [`../backend/src/contracts/api-contracts.md`](../backend/src/contracts/api-contracts.md).

---

## Stack (high level)

| Layer | Technology |
| --- | --- |
| Frontend | React, Vite, TypeScript, Tailwind |
| Backend | Node.js, Express, TypeScript |
| Database | MySQL (see `backend/src/db/schema.sql`) |
| Auth | JWT (`Authorization: Bearer …`) |
| Summaries | Google Gemini (`@google/generative-ai`) — `/ai/summarize/*` |
| Live STT | Deepgram streaming — browser → backend WebSocket → Deepgram |

---

## Product decisions (MVP)

- **Persistence:** MySQL is canonical (design doc once mentioned MongoDB in viewer copy; treat as stale).
- **Recording artifact model:** Single **note** per recording with `rawText`, optional `aiSummary`, etc. (not separate “session file” rows for every artifact unless extended later).
- **Viewer:** Read-only for saved content in product intent; editing workflows may live elsewhere.
- **Post-recording flow:** Land on viewer/home per product iteration; implementation may navigate to Home after save — align with current `ActiveRecording` + routes.

---

## Backend entrypoints

- **HTTP:** `createApp()` in `backend/src/app.ts` — `/auth`, `/items`, `/folders`, `/notes`, `/ai`, `/health`.
- **Process:** `backend/src/server.ts` — `http.createServer(app)` + **WebSocket** attachment for realtime STT (same listen port as HTTP).
- **Transcription:** `backend/src/transcription/registerTranscriptionWss.ts` — path **`/transcription/stream`**, query **`?token=<JWT>`** (verify with same secret as REST). Forwards **binary PCM** upstream: **Deepgram** when `configure.language` is **`en`**, otherwise **Gladia** (`POST https://api.gladia.io/v2/live` then WebSocket URL) with realtime **translation** into the target language. Sends **JSON text** frames to the client (`partial`, `final`, `error`). Helpers: `backend/src/lib/deepgramLive.ts`, `backend/src/lib/gladiaLive.ts`.
- **Deepgram helpers:** `backend/src/lib/deepgramLive.ts` — listen URL (`linear16`, mono, 16 kHz), message normalization.

---

## Environment variables

### Root `.env` (next to `docker-compose.yml`)

Used by **Docker Compose** for substitution into `docker-compose.yml`. Important keys for **`api`**:

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | JWT signing (override default in production) |
| `JWT_EXPIRES_IN` | Optional |
| `GEMINI_API_KEY` | Summarization (`/ai/summarize/*`); optional alias may be documented in code |
| `PRACTICE_API_KEY` | Gemini key for practice exam **generate** and **grade** (`/ai/practice-exam/*`); separate from `GEMINI_API_KEY` |
| `GEMINI_MODEL` | Optional; default in compose e.g. `gemini-2.5-flash-lite` |
| `DEEPGRAM_API_KEY` | Live STT (English) on `/transcription/stream` |
| `GLADIO_API_KEY` | Gladia live translation for non‑English recording languages (alias `GLADIA_API_KEY`) |

**Note:** `backend/.env` is **not** automatically loaded into Docker **`api`** unless you add `env_file` or duplicate keys in root `.env` and pass them through `environment:` in compose.

### Local backend (`backend/.env`)

Used when running `npm run dev` in `backend/` (`dotenv` in `app.ts`). Set DB credentials, `JWT_SECRET`, `DEEPGRAM_API_KEY`, `GLADIO_API_KEY` (Gladia), `GEMINI_*`, and **`PRACTICE_API_KEY`** for practice exams (or rely on repo root `.env`, which is loaded after `backend/.env` for missing keys).

### Frontend build-time (`VITE_*`)

- **Docker / Nginx production bundle:** Often **omit** `VITE_API_URL` so the browser uses **same origin** (`http://localhost:8080`) for `/auth`, `/notes`, etc., and **`getTranscriptionStreamUrl`** uses **`ws(s)://<window.location.host>`** so the WebSocket hits Nginx on the same port.
- **Local Vite (`npm run dev`):** Set **`frontend/.env`** with `VITE_API_URL=http://localhost:4000` so REST **and** WebSocket STT target the API on **4000**. If `VITE_API_URL` is unset, the client may default to `ws://<host>:5173` for WS, which **will not** reach the API unless you add a Vite **WebSocket proxy** for `/transcription/stream` (see `frontend/vite.config.ts` — REST paths are proxied; STT path should be added if you want same-origin WS during dev without `VITE_API_URL`).

---

## Docker Compose

- **Services:** `db` (MySQL), `api` (built from `docker/Dockerfile.api`), `web` (Nginx + static SPA from `docker/Dockerfile.web`).
- **Code updates:** Images **copy** source at **build** time — no bind mounts for app code. After pulling changes:  
  `docker compose up -d --build`  
  (rebuild **`api`** and **`web`** when backend or frontend changes).
- **DB init:** `schema.sql` mounts into MySQL **only on first volume create**. Schema changes may require `docker compose down -v` (destructive) or manual migration.

---

## Nginx (`docker/nginx/default.conf`)

- Proxies **`/auth`**, **`/items`**, **`/folders`**, **`/notes`**, **`/ai`**, **`/health`** to **`http://api:4000`**.
- **WebSocket STT:** **`location /transcription/stream`** must proxy to **`api:4000`** with **`Upgrade`** and **`Connection`** headers and long read timeouts.
- **Nginx only supports `#` comments** — do **not** use `/* … */` (will fail with `unknown directive`).

---

## Frontend — recording / STT

- **Page:** `frontend/src/app/pages/ActiveRecording.tsx` — mic → PCM (see `frontend/src/app/lib/audioPcm16k.ts`) → WebSocket.
- **URL helper:** `frontend/src/app/lib/transcriptionWs.ts` — `getTranscriptionStreamUrl`, `buildConfigureMessage`.
- **Language labels:** mapped to Deepgram codes in `frontend/src/app/lib/transcriptionLanguage.ts`.

---

## Testing

- **Backend:** `cd backend && npm test` (Vitest). Includes mocked Deepgram proxy tests; does not call real Deepgram/Gemini in CI unless configured.
- **Typecheck:** `cd backend && npm run typecheck`
- **Frontend build:** `cd frontend && npm run build`

---

## Git / integration notes (historical)

- **`main`** merged **`ai-and-deepgram-integration`**: combined **Gemini** env vars with **Deepgram** in `docker-compose.yml` and `backend/README.md`. **`ActiveRecording`** kept the **Deepgram realtime** pipeline from the feature branch to avoid conflicting dual transcript UIs.
- **JWT in WebSocket query** is an MVP tradeoff; production may prefer short-lived STT tickets or post-connect auth.

---

## Quick troubleshooting

| Symptom | Likely cause |
| --- | --- |
| WebSocket fails to `ws://localhost:4000` while using Docker UI on **8080** | Browser must use **same host:port as the page** (or set `VITE_API_URL` / `VITE_WS_URL` correctly); ensure Nginx proxies `/transcription/stream`. |
| `api` has no `DEEPGRAM_API_KEY` / `GLADIO_API_KEY` in Docker | Add to **root** `.env` and ensure compose passes keys into **`api.environment`**. English recordings need Deepgram; other languages need Gladia (`GLADIO_API_KEY`). |
| Nginx won’t start | Invalid directive — check for `/*` comments; use `#` only. |
| Summaries fail in Docker | Set `GEMINI_API_KEY` in env Compose passes to **`api`**. |

---

## Related paths (bookmark)

| Path | Contents |
| --- | --- |
| `backend/src/contracts/api-contracts.md` | REST + WS transcript contract |
| `backend/README.md` | Local run, env, milestones |
| `docker-compose.yml` | Services and injected env |
| `docker/nginx/default.conf` | SPA + API + WS proxy |
| `docs/design-doc.md` | Product source of truth |
