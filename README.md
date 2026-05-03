# Classroom Companion

Web app for recording lectures, organizing courses and notes, **live speech-to-text** (Deepgram for English; Gladia for other languages), and **AI study tools** powered by **Google Gemini**. Summaries render as **Markdown** in the viewer; practice exams are interactive (multiple choice + short answer, with AI grading for short answers).

## Features

### Core

- **Auth** — Sign up / sign in; JWT sessions; per-user folders and notes.
- **Home** — Browse folders; **search** and **sort**; **list**, **grid**, and **calendar** views; **drag-and-drop** to move notes into folders (and move up to parent); multi-select for bulk actions.
- **Recording** — Session timer, side notes, live transcript; optional **real-time transcription** when keys are configured. **Save recording to** a single control: **Home** (library root) or a **course folder** (create folder inline when needed). Non-English lecture languages use Gladia live translation (English uses Deepgram).
- **Viewer** — Markdown preview for lecture notes and AI summaries; dark/light **theme**; open **practice exams** from generated exam notes.

### AI — summaries

- **Multi-note / folder:** Home → **Select** → pick notes and/or folders (folders include nested notes) → **Generate AI Summary**. Creates a **generated summary** note (opens in the viewer).
- **Single lecture note:** Viewer → **Generate AI summary** (uses the note’s transcript/text).
- **Language:** Output defaults to **English**. The API infers **Spanish** or another language **only when the selected sources are lecture recordings** that share the same non-English language (generated summaries and practice-exam notes do not drive language). You can override with **`outputLanguage`** on the selection endpoint when calling the API directly.
- **Prompting:** Summaries favor **instructor-led teaching** and de-emphasize student chatter in mixed transcripts (prompt-based; not speaker diarization).

### AI — practice exams

- Home → **Select** → **Generate practice exam** — builds a structured exam (JSON) from selected materials, saves it as a note, opens the **Practice Exam** flow.
- **Multiple choice** and **short answer**; **Check answers** grades MC locally and uses Gemini for **short-answer feedback** (`PRACTICE_API_KEY`).
- **Language:** Same recording-based inference as summaries (and optional API override). Short-answer grading **feedback** matches the exam’s stored language.

### Recording extras (browser)

- **Session Q&A** — While recording, open **Session Q&A** under the live transcript, type a question, and tap **Ask**. Answers use only the **recent transcript window** (Gemini; same `GEMINI_API_KEY` as summaries). About **one question every 12 seconds** per user to limit cost.
- **Live glossary (jargon co-pilot)** — While recording, **Live glossary** scans new transcript chunks and surfaces **domain jargon** as chips with one-line definitions (Gemini; same `GEMINI_API_KEY`). Ephemeral during the session; roughly **one scan every ~12 seconds** when enough new words arrive (server also rate-limits).
- After saving a recording, the app **scans the transcript** for exam/due-date phrases (heuristic) and can show **important dates** on the **calendar** view and a one-time **alert** (stored in **localStorage** in the browser—best-effort, confirm dates with your syllabus).

### API keys (see below)

- **`GEMINI_API_KEY`** — AI summaries and single-note summarize.
- **`PRACTICE_API_KEY`** — Practice exam **generation** and **short-answer grading** (same Gemini SDK; separate key optional for quotas/billing).

## Roadmap / in progress

- **PDF and YouTube as sources for AI summary and practice exam** — We are **finishing implementation** so users will be able to point at **PDF documents** and **YouTube links** (in addition to saved lecture notes) when generating **AI summaries** and **practice exams**. Until that ships, those flows apply to **saved notes** (recordings and other note types) selected on Home.

## Repository structure

| Path | Purpose |
| --- | --- |
| `frontend/` | React + Vite SPA |
| `backend/` | Express API, MySQL, JWT, Gemini + Deepgram/Gladia — see **[`backend/README.md`](backend/README.md)** |
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
| `PRACTICE_API_KEY` | _(empty)_ | **Required** for **practice exam** generate + short-answer grade (can match `GEMINI_API_KEY` or use a separate project key) |
| `GEMINI_MODEL` | `gemini-2.5-flash-lite` | Override if quotas differ (e.g. `gemini-flash-latest`, `gemini-1.5-flash`) |
| `DEEPGRAM_API_KEY` | _(empty)_ | **Required** for **English** live recording STT ([Deepgram](https://deepgram.com)) |
| `GLADIO_API_KEY` | _(empty)_ | **Required** for **non‑English** recording languages — [Gladia](https://gladia.io) live translation into the selected language (alias: `GLADIA_API_KEY`) |

Example:

```bash
cp .env.example .env
# Edit .env: set JWT_SECRET, GEMINI_API_KEY, PRACTICE_API_KEY (if using practice exams),
# DEEPGRAM_API_KEY (English STT), GLADIO_API_KEY (other languages)
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

Set at least `JWT_SECRET`, MySQL `DB_*` vars, **`GEMINI_API_KEY`** for summarization, and **`PRACTICE_API_KEY`** for practice exams. For **`/transcription/stream`**, set **`DEEPGRAM_API_KEY`** when using **English** and **`GLADIO_API_KEY`** when using other lecture languages (Gladia).

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

## Using AI features

1. **Multi-note / folder summary:** Home → **Select** → pick notes and/or folders → **Generate AI Summary**. A new note opens in the viewer.
2. **Single-note summary:** Open a lecture note → **Generate AI summary**.
3. **Practice exam:** Home → **Select** → **Generate practice exam** (configure question types and count in the dialog) → complete the exam → **Check answers**.

Without **`GEMINI_API_KEY`**, summary endpoints return a configuration error. Without **`PRACTICE_API_KEY`**, practice exam generate/grade returns a configuration error.

## Authors

- Mason Hart (`mphart`)
- Tyler Mestery (`tmestery`)
- Robin Lin

## License

MIT
