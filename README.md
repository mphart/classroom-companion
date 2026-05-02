# Classroom Companion

Classroom Companion is a web app for recording lectures, organizing sessions by course, and viewing generated study outputs (summaries, transcripts, and related notes).

## Repository structure

- `frontend/` — React + Vite UI
- `backend/` — Express API + MySQL persistence
- `docker/` — Dockerfiles and nginx config used by Compose
- `docs/` — design and page specs; **[`docs/agent-reference.md`](docs/agent-reference.md)** — stack, env, Docker, STT, and troubleshooting for contributors/agents

## Run everything with Docker Compose

**Prerequisites:** Docker Engine and Docker Compose v2 (e.g. Docker Desktop on macOS).

From the repository root:

```bash
docker compose up --build
```

Then open the app at **http://localhost:8080**.

### What this starts

- **`db`** — MySQL 8 with `backend/src/db/schema.sql` applied on first startup  
- **`api`** — Backend on port **4000** inside the Compose network (not published by default)  
- **`web`** — Nginx serves the built SPA and **reverse-proxies API routes** to `api:4000`, so the browser stays same-origin and does not need `VITE_API_URL`.

### Configuration

| Variable | Default (Compose) | Purpose |
| --- | --- | --- |
| `MYSQL_ROOT_PASSWORD` | `companion` | MySQL root password (matches `DB_PASSWORD` on `api`) |
| `JWT_SECRET` | `change-this-in-production` | Signing key for auth tokens (override in real deployments) |
| `JWT_EXPIRES_IN` | `7d` | JWT lifetime |
| `WEB_PORT` | `8080` | Host port mapped to the web container’s port 80 |

Example with a custom JWT secret and port:

```bash
JWT_SECRET="$(openssl rand -hex 32)" WEB_PORT=3000 docker compose up --build
```

### Reset the database volume

If you need a clean MySQL data directory (for example after schema changes during development):

```bash
docker compose down -v
docker compose up --build
```

## Local development (without Docker)

### Backend

```bash
cd backend
npm install
# Ensure MySQL is running and schema applied (see backend/README.md)
npm run dev
```

Default API: **http://localhost:4000**

### Frontend

The Vite dev server proxies `/auth`, `/items`, `/folders`, `/notes`, `/ai`, and `/health` to `127.0.0.1:4000` (see `frontend/vite.config.ts`).

```bash
cd frontend
npm install
npm run dev
```

### Production build (frontend only)

```bash
cd frontend && npm run build
```

### Generate AI Summary (UI)

On Home, enable **Select** mode, choose notes and/or folders, then click **Generate AI Summary**. Folder selection pulls in nested notes; the backend writes a generated summary note for the authenticated user.

## Roadmap

See `docs/design-doc.md`.

## Authors

- Mason Hart (`mphart`)
- Tyler Mestery (`tmestery`)
- Robin Lin

## License

MIT
