# ClassroomCompanion MVP API Contracts

All protected routes require `Authorization: Bearer <jwt>`.

## Auth

- `POST /auth/signup`
  - Request: `{ "name": "Robin Lin", "username": "robin", "password": "password123" }`
  - Response `201`: `{ "token": "...", "user": { "id": 1, "name": "Robin Lin", "username": "robin" } }`
- `POST /auth/login`
  - Request: `{ "username": "robin", "password": "password123" }`
  - Response `200`: same as signup.
- `POST /auth/logout`
  - Response `204`
- `GET /auth/me`
  - Response `200`: `{ "user": { "id": 1, "name": "Robin Lin", "username": "robin" } }`

## Items + Folders

- `GET /items?directory=userId/physics/&q=chapter&sortBy=lastEditedDate&sortDir=desc`
  - Response `200`:
    - `{ "items": [{ "id": 9, "type": "note", "name": "Lecture 3", "directory": "userId/physics/", "createdDate": "...", "lastEditedDate": "...", "noteSourceType": "recording" }] }`
      - `noteSourceType` is only included for `note` items (`recording`, `generated_summary`, or `generated_practice_exam`)
- `POST /folders`
  - Request: `{ "name": "Physics", "directory": "userId/" }`
  - Response `201`: `{ "item": { "id": 3, "type": "folder", "name": "Physics", "directory": "userId/", "createdDate": "...", "lastEditedDate": "..." } }`
- `PATCH /items/:itemId/rename`
  - Request: `{ "newName": "Chapter 3" }`
  - Response `200`: `{ "item": { ... } }`
- `DELETE /items`
  - Request: `{ "itemIds": [3, 12, 19] }`
  - Response `200`: `{ "deletedCount": 3 }`

## Notes (Recording Output)

- `POST /notes`
  - Request:
    - `{ "title": "Lecture-02-05", "directory": "userId/physics/", "rawText": "Today we covered...", "language": "English", "durationSeconds": 3120 }`
  - Response `201`: `{ "note": { "id": 22, "title": "Lecture-02-05", "directory": "userId/physics/", "rawText": "...", "aiSummary": null, "language": "English", "durationSeconds": 3120, "sourceType": "recording", "generatedFromCount": null, "createdDate": "...", "lastEditedDate": "..." } }`
- `GET /notes/:noteId`
  - Response `200`: `{ "note": { ...same shape... } }`
- `GET /notes?directory=userId/physics/`
  - Response `200`: `{ "notes": [{ ...noteShape }] }`

## AI Summaries

- `POST /ai/summarize/note/:noteId`
  - Response `200`: `{ "note": { ...with aiSummary populated... } }`
- `POST /ai/summarize/selection`
  - Request: `{ "noteIds": [1, 2], "folderIds": [3], "outputDirectory": "userId/physics/", "title": "Midterm Review Summary", "outputLanguage"?: "Spanish" }` — optional **`outputLanguage`** overrides inference; if omitted and **every** source note shares the same `language`, Gemini uses that language and the new note’s `language` field is set accordingly (otherwise defaults to English).
  - Response `201`: `{ "note": { ...sourceType: "generated_summary"... }, "sourceCount": 5 }`
  - Single-note summarize uses the stored note’s `language` field to steer Gemini output.

## Practice exams (Gemini)

Server uses **`PRACTICE_API_KEY`** (not `GEMINI_API_KEY`) for generate and grade. Same `GEMINI_MODEL` applies unless you add a separate model later.

- `POST /ai/practice-exam/generate`
  - Request:
    - `{ "noteIds": [1], "folderIds": [2], "outputDirectory": "userId/", "title": "Unit 2 Quiz", "questionCount": 10, "includeMultipleChoice": true, "includeShortAnswer": true, "otherInstructions": "Focus on definitions", "outputLanguage"?: "Spanish" }`
    - At least one of `includeMultipleChoice` / `includeShortAnswer` must be true. `questionCount` is 1–30. Optional **`outputLanguage`** overrides inference; if omitted, the exam is in **English** unless selected sources follow the same rules as AI summaries (non-English **recording** notes that agree on one language → exam and stored `note.language` in that language).
  - Response `201`: `{ "note": { ...sourceType: "generated_practice_exam", "rawText": "<JSON exam document>", ... }, "sourceCount": 5 }`
  - The note’s `rawText` is a JSON object: `{ "version": 1, "title": string, "questions": [ ... ] }` with each question either `multiple_choice` (`prompt`, `options`, `correctIndex`, optional `explanation`) or `short_answer` (`prompt`, `referenceAnswer`).

- `POST /ai/practice-exam/grade`
  - Request: `{ "noteId": 42, "responses": [ { "questionIndex": 3, "answer": "student text" } ] }` — only indices that refer to `short_answer` questions in that note.
  - Response `200`: `{ "results": [ { "questionIndex": 3, "verdict": "correct" | "partial" | "incorrect", "feedback": "..." } ] }`
  - Returns `400` if the note is not a practice exam or an index is not a short-answer question.

## Realtime Speech-to-Text (WebSocket)

Browser connects **after login** — same JWT as REST, passed as query string (**do not leak in logs / analytics**):

- **URL**: `ws://<host>:<port>/transcription/stream?token=<jwt>`
  - Frontend may set **`VITE_WS_URL`** explicitly, or derive from **`VITE_API_URL`** (replace `http` → `ws`, `https` → `wss`). If both are unset (typical Docker+Nginx build), the client uses **`ws(s)://<same host:port as the page>`** (e.g. `ws://localhost:8080`) and Nginx must proxy **`/transcription/stream`** to **`api:4000`** with WebSocket upgrade headers.
- **Server env**: **`DEEPGRAM_API_KEY`** when `configure.language` is **`en`** (Deepgram realtime STT). **`GLADIO_API_KEY`** (alias **`GLADIA_API_KEY`**) when language is **not** `en` — [Gladia](https://gladia.io) live **translation** into that code. Optional: **`DG_MODEL`**, **`DG_ENDPOINTING_MS`**, **`DEEPGRAM_WS_HOST`**.

After connect:

1. **Optional text** (`UTF-8` JSON): `{ "type": "configure", "language": "en" }` — BCP‑47-ish code (`en`, `es`, …). **`en`** → Deepgram; **other** → Gladia with translation into that language. Send **before** the first audio chunk you care about (see implementation).
2. **Binary**: PCM **signed 16‑bit little-endian**, **mono**, **16000 Hz** (`linear16` / “telephony PCM” framing — raw samples only, **no WAV header**).
3. **Stop**: text `{ "type": "stop" }` or close the socket.

**Downstream transcript events** (JSON text frames from backend):

- `{ "type": "partial", "text": "...", "start"?: number, "duration"?: number, "words"?: [{ "word": "...", "confidence": 0.94 }] }` — when upstream is **Deepgram** with `words=true`, `words` mirrors per-token confidence (0–1) for live highlighting.
- `{ "type": "final", "text": "...", "start"?: number, "duration"?: number, "words"?: [...] }`
- `{ "type": "error", "message": "..." }`

## Error Envelope

- Validation: `400 { "error": "Validation failed.", "issues": [...] }`
- Unauthorized: `401 { "error": "Missing bearer token." }` or `401 { "error": "Invalid or expired token." }`
- Not Found: `404 { "error": "Route not found." }` or resource-specific not-found messages.
