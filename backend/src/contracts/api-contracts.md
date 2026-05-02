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
      - `noteSourceType` is only included for `note` items (`recording` vs `generated_summary`)
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
  - Request: `{ "noteIds": [1, 2], "folderIds": [3], "outputDirectory": "userId/physics/", "title": "Midterm Review Summary" }`
  - Response `201`: `{ "note": { ...sourceType: "generated_summary"... }, "sourceCount": 5 }`

## Realtime Speech-to-Text (WebSocket)

Browser connects **after login** — same JWT as REST, passed as query string (**do not leak in logs / analytics**):

- **URL**: `ws://<host>:<port>/transcription/stream?token=<jwt>`
  - Frontend may set **`VITE_WS_URL`** explicitly, or derive from **`VITE_API_URL`** (replace `http` → `ws`, `https` → `wss`). If both are unset (typical Docker+Nginx build), the client uses **`ws(s)://<same host:port as the page>`** (e.g. `ws://localhost:8080`) and Nginx must proxy **`/transcription/stream`** to **`api:4000`** with WebSocket upgrade headers.
- **Server env**: **`DEEPGRAM_API_KEY`** (required for live transcription). Optional: **`DG_MODEL`** (default `nova-2`), **`DG_ENDPOINTING_MS`** (milliseconds), **`DEEPGRAM_WS_HOST`** (override base, default `wss://api.deepgram.com`).

After connect:

1. **Optional text** (`UTF-8` JSON): `{ "type": "configure", "language": "en" }` — Deepgram/BCP‑47-ish code (`en`, `es`, …). Must arrive **before** any audio if you rely on language for the first utterance (see implementation).
2. **Binary**: PCM **signed 16‑bit little-endian**, **mono**, **16000 Hz** (`linear16` / “telephony PCM” framing — raw samples only, **no WAV header**).
3. **Stop**: text `{ "type": "stop" }` or close the socket.

**Downstream transcript events** (JSON text frames from backend):

- `{ "type": "partial", "text": "...", "start"?: number, "duration"?: number }`
- `{ "type": "final", "text": "...", "start"?: number, "duration"?: number }`
- `{ "type": "error", "message": "..." }`

## Error Envelope

- Validation: `400 { "error": "Validation failed.", "issues": [...] }`
- Unauthorized: `401 { "error": "Missing bearer token." }` or `401 { "error": "Invalid or expired token." }`
- Not Found: `404 { "error": "Route not found." }` or resource-specific not-found messages.
