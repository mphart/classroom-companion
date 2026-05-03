# ClassroomCompanion Backend (MVP)

To run API + UI + database together without a local toolchain, use **`docker compose` from the repository root** (see root `README.md`).

## Run

- `npm install`
- `npm run dev`

Default server port is `4000`.

## Environment

- `PORT=4000`
- `JWT_SECRET=change-me`
- `JWT_EXPIRES_IN=7d`
- `DB_HOST=localhost`
- `DB_PORT=3306`
- `DB_USER=root`
- `DB_PASSWORD=`
- `DB_NAME=classroom_companion`
- **`GEMINI_API_KEY`**: Required for `/ai/summarize/*`. Get a key from Google AI Studio. Optional alias: **`GOOGLE_GENERATIVE_AI_API_KEY`**.
- **`PRACTICE_API_KEY`**: Required for **`/ai/practice-exam/*`** (generate + grade). Uses the same Gemini SDK; keep this key separate from `GEMINI_API_KEY` if you want different quotas/projects. Also loaded from the repo root `.env` after `backend/.env` (see `app.ts`).
- **`GEMINI_MODEL`** (optional): Defaults to `gemini-flash-latest` (matches `v1beta/models/gemini-flash-latest`). Override if your project’s quota works better on another model (e.g. `gemini-1.5-flash`).
- **Summarization behavior**: `/ai/summarize/*` instructs Gemini to extract **instructor / professor teaching** from mixed speech-to-text (student chatter and off-topic lines are de-emphasized). This is prompt-based, not true diarization—quality improves if the mic favors the instructor.
- **`DEEPGRAM_API_KEY`**: Required for **`/transcription/stream`** when the client configures language **`en`** (Deepgram realtime STT, including per-word confidence when `words=true`).
- **`GLADIO_API_KEY`** (or **`GLADIA_API_KEY`**): Required when the lecture language is **not English** — [Gladia](https://gladia.io) live **translation** into that ISO‑639‑1 code (same PCM as Deepgram). English uses Deepgram only.

Optional transcription tuning:

- `DG_MODEL=nova-2`
- `DG_ENDPOINTING_MS=300`
- `DEEPGRAM_WS_HOST=wss://api.deepgram.com`

Frontend: **`VITE_API_URL=http://localhost:4000`** for local REST + WS to the API port. For Docker+Nginx same-origin bundles, omit it so the SPA uses **`ws(s)`** with **`window.location.host`** and Nginx proxies **`/transcription/stream`**. Override with **`VITE_WS_URL`** if needed.

## Database

Apply `src/db/schema.sql` against MySQL before using the real repository.

## Incremental Delivery Milestones

1. **Auth foundation**: `/auth/signup`, `/auth/login`, `/auth/logout`, `/auth/me`.
2. **Home browsing**: `/items`, `/folders`, rename + bulk delete.
3. **Recording output**: create and fetch notes with read-only viewer payload.
4. **AI flows**: summarize single note and multi-selection into generated summary note.
5. **Hardening**: validation, per-user access control, integration tests.
