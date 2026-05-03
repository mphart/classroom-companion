# Agent reference — implementation context

This document summarizes **architecture, env, Docker, speech-to-text, PDF slide uploads, AI flashcards, and common pitfalls** so future agents (or humans) can work on the repo without re-deriving context from chat logs.

Product and UX specs live in [`design-doc.md`](design-doc.md) and [`pages/`](pages/). **HTTP/WebSocket contracts** are in [`../backend/src/contracts/api-contracts.md`](../backend/src/contracts/api-contracts.md).

---

## Stack (high level)

| Layer | Technology |
| --- | --- |
| Frontend | React, Vite, TypeScript, Tailwind |
| Backend | Node.js, Express, TypeScript |
| Database | MySQL (see `backend/src/db/schema.sql`) |
| Auth | JWT (`Authorization: Bearer …`) |
| Summaries + flashcards | Google Gemini (`@google/generative-ai`) — `/ai/summarize/*`, **`/ai/flashcards/generate`** (`GEMINI_API_KEY`) |
| Practice exams | Gemini via **`PRACTICE_API_KEY`** — `/ai/practice-exam/*` (generate + grade) |
| Live STT | Deepgram streaming — browser → backend WebSocket → Deepgram |
| Slide PDFs | Upload + disk storage; **pdfjs-dist** extracts per-page text server-side; viewer loads PDF via authenticated blob URL |

---

## Product decisions (MVP)

- **Persistence:** MySQL is canonical (design doc once mentioned MongoDB in viewer copy; treat as stale).
- **Recording artifact model:** Single **note** per recording with `rawText`, optional `aiSummary`, etc. (not separate “session file” rows for every artifact unless extended later).
- **Viewer:** Read-only for saved content in product intent; editing workflows may live elsewhere.
- **Post-recording flow:** Land on viewer/home per product iteration; implementation may navigate to Home after save — align with current `ActiveRecording` + routes.
- **Library folder context:** Navigating from **Home** to Viewer, Practice Exam, or Flashcards passes **`browseDirectory`** (the current browse path) in **React Router `location.state`**. **Back** on those pages navigates to `/home` with the same state so **`Home.tsx`** restores **`currentDirectory`**. If state is missing (e.g. cold load), Viewer-style pages fall back to **`note.directory`**. **AI summary, practice exam, and flashcard** generation all use **`outputDirectory: currentDirectory`** so new items land in the folder the user was browsing.
- **Slide decks (PDF):** One **note** per upload with `source_type = slide_pdf`, `notes.pdf_file_path` (relative to upload root), and `raw_text` holding extracted text with `--- Slide N ---` markers for AI. Whole-deck selection uses **`/ai/summarize/selection`**, **`/ai/practice-exam/generate`**, and **`/ai/flashcards/generate`** like other notes. Image-only PDFs get a placeholder message in `raw_text` but the file remains viewable.

---

## Backend entrypoints

- **HTTP:** `createApp()` in `backend/src/app.ts` — `/auth`, `/items`, `/folders`, `/notes`, `/ai`, `/health`.
- **Flashcard decks (AI):** **`POST /ai/flashcards/generate`** — body matches selection-style APIs (`noteIds`, `folderIds`, `outputDirectory`, `title`, optional `outputLanguage`); reuses **`Repository.collectSummarySources`**. Uses **`GEMINI_API_KEY`** (same as summaries). Creates a note with **`source_type = generated_flashcards`**, **`raw_text`** = JSON `{ version: 1, title, cards: [{ term, definition }] }`. Code: **`backend/src/lib/flashcardsGen.ts`**, route in **`backend/src/routes/aiRoutes.ts`**. Schema: enum value + migration **`backend/src/db/migrations/003_flashcards.sql`**; **`MySqlRepository.ensureNotesSchema()`** upgrades existing DBs.
- **PDF slides:** `POST /notes/upload-pdf` — multipart (`file`, `directory`, optional `title`); max **25 MB**; stores PDF under `PDF_UPLOAD_DIR` / default `uploads/pdfs` (`backend/src/lib/uploadPaths.ts`). `GET /notes/:noteId/pdf` — streams the file (**JWT**); used by the viewer after `fetchNotePdfBlob`. Implementation: `backend/src/routes/noteRoutes.ts`, extraction `backend/src/lib/extractPdfText.ts`. MySQL startup runs `ensureNotesSchema()` (`slide_pdf` enum + `pdf_file_path` column).
- **Item move (reparent):** `PATCH /items/:itemId/move` with body `{ "targetDirectory": "<parent path trailing slash>" }` — implemented in `Repository.moveItem` (`mysqlRepository`, `inMemoryRepository`). Validates name collisions (`409`), folder-into-self/descendant (`400`), and **folder depth** (see below). Errors that should return 4xx use `HttpClientError` in `backend/src/lib/errors.ts` (handled in `backend/src/middleware/error.ts`).
- **Folder depth (strict MVP):** At most **two** folder-name segments under the user root (e.g. `userId/A/` and `userId/A/B/`). The inner folder (`B`) **must not** contain subfolders (notes allowed). Helpers: `backend/src/lib/itemPathDepth.ts`; move validation: `backend/src/lib/validateItemMove.ts`. **`POST /folders`** rejects creating a folder when the parent directory is already at the innermost level.
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
| `GEMINI_API_KEY` | Summarization (`/ai/summarize/*`) and **flashcard generation** (`/ai/flashcards/generate`); optional alias may be documented in code |
| `PRACTICE_API_KEY` | Gemini key for practice exam **generate** and **grade** (`/ai/practice-exam/*`); separate from `GEMINI_API_KEY` |
| `GEMINI_MODEL` | Optional; default in compose e.g. `gemini-2.5-flash-lite` |
| `DEEPGRAM_API_KEY` | Live STT (English) on `/transcription/stream` |
| `GLADIO_API_KEY` | Gladia live translation for non‑English recording languages (alias `GLADIA_API_KEY`) |
| `PDF_UPLOAD_DIR` | (Optional) Absolute path for slide PDF files; Compose sets `/data/uploads/pdfs` on **`api`** with volume **`pdf_uploads`** |

**Note:** `backend/.env` is **not** automatically loaded into Docker **`api`** unless you add `env_file` or duplicate keys in root `.env` and pass them through `environment:` in compose.

### Local backend (`backend/.env`)

Used when running `npm run dev` in `backend/` (`dotenv` in `app.ts`). Set DB credentials, `JWT_SECRET`, `DEEPGRAM_API_KEY`, `GLADIO_API_KEY` (Gladia), `GEMINI_*`, and **`PRACTICE_API_KEY`** for practice exams (or rely on repo root `.env`, which is loaded after `backend/.env` for missing keys). Optional **`PDF_UPLOAD_DIR`** overrides the default `uploads/pdfs` directory under the process cwd for slide PDF storage.

### Frontend build-time (`VITE_*`)

- **Docker / Nginx production bundle:** Often **omit** `VITE_API_URL` so the browser uses **same origin** (`http://localhost:8080`) for `/auth`, `/notes`, etc., and **`getTranscriptionStreamUrl`** uses **`ws(s)://<window.location.host>`** so the WebSocket hits Nginx on the same port.
- **Local Vite (`npm run dev`):** Set **`frontend/.env`** with `VITE_API_URL=http://localhost:4000` so REST **and** WebSocket STT target the API on **4000**. If `VITE_API_URL` is unset, the client may default to `ws://<host>:5173` for WS, which **will not** reach the API unless you add a Vite **WebSocket proxy** for `/transcription/stream` (see `frontend/vite.config.ts` — REST paths are proxied; STT path should be added if you want same-origin WS during dev without `VITE_API_URL`).

---

## Docker Compose

- **Services:** `db` (MySQL), `api` (built from `docker/Dockerfile.api`), `web` (Nginx + static SPA from `docker/Dockerfile.web`). **`api`** mounts volume **`pdf_uploads` → `/data/uploads/pdfs`** so uploaded slide PDFs survive container restarts.
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

## Frontend — Home file browser (items / folders)

- **Page:** `frontend/src/app/pages/Home.tsx` — lists items for `currentDirectory`, selection mode, **AI summary / practice exam / flashcards** generation, list / grid / calendar layouts (motion + ambient background from `main` UI pass). **+ New → Upload PDF slides** calls `uploadSlidePdf` (`frontend/src/app/lib/api.ts`) into the current folder. **`browseDirectory`** is passed in router state when opening Viewer, Practice Exam, or Flashcards (and when returning from generation flows). A **`useEffect`** on **`location.state.browseDirectory`** restores the folder after **Back**. **Flashcard** notes open **`/flashcards`** directly; list/calendar icons use **`frontend/src/assets/flashcards.svg`** (~24px, same visual weight as emoji glyphs). Calendar sidebar includes a **Flashcards** visibility toggle.
- **Drag-and-drop:** `react-dnd` + `react-dnd-html5-backend`. The page root is wrapped in **`DndProvider`**. Items use **`useDrag`**; **folder** rows (and the synthetic **`..` / `DotDotFolderRow`**) use **`useDrop`** to call `moveItem` from `frontend/src/app/lib/api.ts`, then refresh the listing (and calendar tree when in calendar mode). **`sonner`** toasts for success/errors; **`Toaster`** is mounted in `frontend/src/app/App.tsx` next to **`RouterProvider`** and **`ThemeToggle`**.
- **Parent row (`..`):** When **not** at the user root directory, a **`DotDotFolderRow`** appears (list + grid first row; calendar sidebar). Click navigates up (same as Back); drop moves the dragged item to **`parentDirectory(currentDirectory)`** via the same move API.

---

## Frontend — Viewer (notes + slide PDFs)

- **Page:** `frontend/src/app/pages/Viewer.tsx` — loads note via `getNote`. For **`sourceType === 'slide_pdf'`**, fetches bytes with **`fetchNotePdfBlob`** and displays an **iframe** (blob URL); shows **Extracted text** below for transparency and Gemini summary when text exists. For **`generated_practice_exam`** / **`generated_flashcards`**, shows **Open practice exam** / **Open flashcards** (navigate with **`browseDirectory`** preserved in state). URL sync for **`?noteId=`** keeps **`browseDirectory`** on **`replace`** navigation.

---

## Frontend — Practice Exam & Flashcards (full-screen flows)

- **Routes:** `frontend/src/app/routes.tsx` — **`/practice-exam`**, **`/flashcards`** (auth layout). Prefer **`@/app/pages/...`** imports if the IDE mis-resolves relative `./pages/*` from `routes.tsx`.
- **Practice Exam:** `frontend/src/app/pages/PracticeExam.tsx` — interactive MC + SA; **Back** uses **`browseDirectory`** state or **`note.directory`**.
- **Flashcards:** `frontend/src/app/pages/Flashcards.tsx` — loads **`generated_flashcards`** note JSON; flip (3D CSS), prev/next, shuffle, filters **All / Still learning / Known** (ratings are **session-only**, not persisted). Filter chips stay visible when a filter yields zero cards so users can switch back. **Back** matches Practice Exam.

---

## Testing

- **Backend:** `cd backend && npm test` (Vitest). Includes mocked Deepgram proxy tests; does not call real Deepgram/Gemini in CI unless configured. **`src/tests/app.test.ts`** covers item **move**, folder-depth limits, **`POST /folders`** depth guard, **`POST /ai/flashcards/generate`** (stub deck in test env), and related flows (in-memory app).
- **Typecheck:** `cd backend && npm run typecheck`
- **Frontend build:** `cd frontend && npm run build`

---

## Git / integration notes (historical)

- **`main`** merged **`ai-and-deepgram-integration`**: combined **Gemini** env vars with **Deepgram** in `docker-compose.yml` and `backend/README.md`. **`ActiveRecording`** kept the **Deepgram realtime** pipeline from the feature branch to avoid conflicting dual transcript UIs.
- **`main`** merged **`drag-and-drop`**: item **move** API + strict **two-level** folder tree; Home **DnD** and **`..`** parent row. Merge conflicts in **`App.tsx`** / **`Home.tsx`** were resolved by keeping **`main`’s** motion/ambient/profile UI and wrapping Home in **`DndProvider`**, preserving **`ThemeToggle`** + **`Toaster`** alongside **`RouterProvider`**.
- **JWT in WebSocket query** is an MVP tradeoff; production may prefer short-lived STT tickets or post-connect auth.

---

## Quick troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Move / create folder returns **400** about nesting | Path would exceed **two** folder levels under `userId/`, or a folder would be placed inside the innermost folder — by design (`itemPathDepth` / `validateItemMove`). |
| WebSocket fails to `ws://localhost:4000` while using Docker UI on **8080** | Browser must use **same host:port as the page** (or set `VITE_API_URL` / `VITE_WS_URL` correctly); ensure Nginx proxies `/transcription/stream`. |
| `api` has no `DEEPGRAM_API_KEY` / `GLADIO_API_KEY` in Docker | Add to **root** `.env` and ensure compose passes keys into **`api.environment`**. English recordings need Deepgram; other languages need Gladia (`GLADIO_API_KEY`). |
| Nginx won’t start | Invalid directive — check for `/*` comments; use `#` only. |
| Summaries fail in Docker | Set `GEMINI_API_KEY` in env Compose passes to **`api`**. |
| Flashcard generation **503** | Same as summaries — needs **`GEMINI_API_KEY`** on **`api`**. |
| Flashcards fail with DB enum error | Run migration **`003_flashcards.sql`** or restart API so **`ensureNotesSchema()`** adds **`generated_flashcards`** to `notes.source_type`. |
| Slide PDF **404** or missing after deploy | Ensure **`PDF_UPLOAD_DIR`** matches the mounted volume path (`/data/uploads/pdfs` in Compose) and the **`pdf_uploads`** volume is present; local dev uses `**/uploads/pdfs/` under cwd (gitignored). |

---

## Related paths (bookmark)

| Path | Contents |
| --- | --- |
| `backend/src/lib/itemPathDepth.ts` | User-root folder path depth helpers |
| `backend/src/lib/validateItemMove.ts` | Move target validation (depth, cycle, collision) |
| `backend/src/routes/itemRoutes.ts` | Items list, rename, **move**, bulk delete |
| `backend/src/routes/noteRoutes.ts` | Notes CRUD, **`POST /upload-pdf`**, **`GET /:noteId/pdf`** |
| `backend/src/lib/extractPdfText.ts` | PDF text extraction (pdfjs-dist) |
| `backend/src/lib/uploadPaths.ts` | `PDF_UPLOAD_DIR` / default upload directory |
| `backend/src/contracts/api-contracts.md` | REST + WS transcript contract |
| `backend/README.md` | Local run, env, milestones |
| `docker-compose.yml` | Services and injected env |
| `docker/nginx/default.conf` | SPA + API + WS proxy |
| `docs/design-doc.md` | Product source of truth |
| `backend/src/db/schema.sql` + `backend/src/db/migrations/` | MySQL schema; incremental migrations (e.g. **`slide_pdf`**, **`generated_flashcards`**, **`pdf_file_path`**) |
| `backend/src/lib/flashcardsGen.ts` | Gemini JSON deck generation + test stub |
| `frontend/src/app/pages/Flashcards.tsx` | Flashcard study UI |
| `frontend/src/assets/flashcards.svg` | Home list/calendar icon for flashcard items |
