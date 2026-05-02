# ClassroomCompanion Backend (MVP)

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

## Database

Apply `src/db/schema.sql` against MySQL before using the real repository.

## Incremental Delivery Milestones

1. **Auth foundation**: `/auth/signup`, `/auth/login`, `/auth/logout`, `/auth/me`.
2. **Home browsing**: `/items`, `/folders`, rename + bulk delete.
3. **Recording output**: create and fetch notes with read-only viewer payload.
4. **AI flows**: summarize single note and multi-selection into generated summary note.
5. **Hardening**: validation, per-user access control, integration tests.
