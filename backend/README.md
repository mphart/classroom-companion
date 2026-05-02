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
- **`DEEPGRAM_API_KEY=`** — required for `/transcription/stream` WebSocket realtime STT

Optional transcription tuning:

- `DG_MODEL=nova-2`
- `DG_ENDPOINTING_MS=300`
- `DEEPGRAM_WS_HOST=wss://api.deepgram.com`

Frontend connects with `VITE_API_URL=http://localhost:4000` (REST) and derives `ws://localhost:4000/transcription/stream`, unless you override with **`VITE_WS_URL`** (same host/port scheme as the API).

## Database

Apply `src/db/schema.sql` against MySQL before using the real repository.

## Incremental Delivery Milestones

1. **Auth foundation**: `/auth/signup`, `/auth/login`, `/auth/logout`, `/auth/me`.
2. **Home browsing**: `/items`, `/folders`, rename + bulk delete.
3. **Recording output**: create and fetch notes with read-only viewer payload.
4. **AI flows**: summarize single note and multi-selection into generated summary note.
5. **Hardening**: validation, per-user access control, integration tests.
