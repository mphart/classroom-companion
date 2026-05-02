# Classroom Companion

Web app for recording lectures, organizing courses and notes, **live speech-to-text** (Deepgram), and **AI study summaries** (Google Gemini). Summaries are shown as **rendered Markdown** in the viewer—not raw code.

## Features

- **Auth** — Sign up / sign in; per-user folders and notes.
- **Home** — Browse folders, search/sort, multi-select delete, create folders.
- **Recording** — Session timer, quick notes, transcript area; optional **live transcription** when Deepgram is configured (browser WebSocket to the API).
- **AI summary** — Select notes and/or folders on Home → **Generate AI Summary** creates a new note. **Summarize with Gemini** on a single lecture note. Gemini is instructed to favor **instructor-led teaching** and de-emphasize student chatter in mixed transcripts (prompt-based; not speaker diarization).
- **Viewer** — Markdown preview for summaries and note bodies; dark/light theme.

## Repository structure

| Path | Purpose |
| --- | --- |
| `frontend/` | React + Vite SPA |
| `backend/` | Express API, MySQL, JWT, Gemini + Deepgram integration — see **[`backend/README.md`](backend/README.md)** |
| `docker/` | Dockerfiles and Nginx config for Compose |
| `docs/` | Design notes; **[`docs/agent-reference.md`](docs/agent-reference.md)** — stack, env, Docker, STT, troubleshooting |

## Run with Docker Compose

**Prerequisites:** Docker Engine + Compose v2 (e.g. Docker Desktop).

From the repo root:

```bash
docker compose up --build
```

Open **http://localhost:8080** (or `WEB_PORT` if you override it).

### What starts

- **`db`** — MySQL 8; `backend/src/db/schema.sql` runs on first boot.
- **`api`** — Node API on **4000** inside the network (not published by default).
- **`web`** — Nginx serves the built SPA and **proxies** `/auth`, `/items`, `/folders`, `/notes`, `/ai`, `/health`, and **`/transcription/stream`** (WebSocket upgrade) to the API so the browser stays same-origin.

### Environment (Compose)

Copy **[`.env.example`](.env.example)** to `.env` and fill in secrets. Compose reads `.env` from the **repository root**.

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | `change-this-in-production` | JWT signing key — **override in production** |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `WEB_PORT` | `8080` | Host port for the web UI |
| `GEMINI_API_KEY` | _(empty)_ | **Required** for Generate AI Summary / single-note summarize ([Google AI Studio](https://aistudio.google.com/apikey)) |
| `GEMINI_MODEL` | `gemini-flash-latest` | Override if quotas differ (e.g. `gemini-1.5-flash`) |
| `DEEPGRAM_API_KEY` | _(empty)_ | **Required** for live **Recording** transcription ([Deepgram](https://deepgram.com)) |

Example:

```bash
cp .env.example .env
# Edit .env: set JWT_SECRET, GEMINI_API_KEY, DEEPGRAM_API_KEY (optional if you only use manual transcript)
docker compose up --build
```

### Reset the database

```bash
docker compose down -v
docker compose up --build
```

## Local development (no Docker)

**Prerequisites:** Node 20+ (recommended), local MySQL with schema applied — see [`backend/README.md`](backend/README.md).

### Backend

```bash
cd backend
npm install
npm run dev
```

API: **http://localhost:4000**

Set at least `JWT_SECRET`, MySQL `DB_*` vars, and **`GEMINI_API_KEY`** for summarization. Use **`DEEPGRAM_API_KEY`** for `/transcription/stream`.

### Frontend

Vite proxies REST paths to **127.0.0.1:4000** (`frontend/vite.config.ts`). For **live STT**, the client opens a WebSocket to the API; easiest path is **Docker** (Nginx handles upgrades) or configure your dev setup to reach `ws://localhost:4000/transcription/stream` with a valid JWT — see **`docs/agent-reference.md`**.

```bash
cd frontend
npm install
npm run dev
```

Optional: `VITE_API_URL` if the API is not same-origin (production or custom proxy).

### Builds

```bash
cd frontend && npm run build
cd backend && npm run build && npm run test
```

## Using AI summaries

1. **Multi-note / folder:** Home → enable **Select** → pick notes and/or folders (folders include nested notes) → **Generate AI Summary**. A new **generated summary** note opens in the viewer.
2. **One lecture note:** Open the note in the viewer → **Summarize with Gemini** (uses the note’s stored transcript/text).

Without `GEMINI_API_KEY`, the API returns an error explaining the missing configuration.

## Authors

- Mason Hart (`mphart`)
- Tyler Mestery (`tmestery`)
- Robin Lin

## License

MIT
