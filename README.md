# Classroom Companion

Classroom Companion is a web app for recording lectures, organizing sessions by course, and viewing generated study outputs (summary, transcript, key terms, and study questions).

## Repository structure

- `frontend/` - React + Vite client application
- `docs/` - project and design documentation

## Getting started

### Prerequisites

- Node.js 18+ (Node 20 recommended)
- npm 9+

### Install dependencies

From the repository root:

```bash
npm --prefix frontend install
```

Or:

```bash
cd frontend
npm install
```

### Run the frontend (dev)

From the repository root:

```bash
npm --prefix frontend run dev
```

Or from `frontend/`:

```bash
npm run dev
```

## Build

```bash
npm --prefix frontend run build
```

### Generate AI Summary button
- On the Home page, enable Selection Mode and select lecture files and/or folders.
- Click **Generate AI Summary** to create a combined summary from selected sources.
- Folder selection is recursive (lecture files in nested folders are included).
- Generated summaries are saved to the Home/root directory and open in the Viewer page automatically.

## Roadmap

See `docs/design-doc.md` for planned work and design notes.

## Authors

- Mason Hart (`mphart`)
- Tyler Mestery (`tmestery`)
- Robin Lin

## License

MIT
