# Classroom Companion — frontend

React + Vite single-page app. See the **[root `README.md`](../README.md)** for full features, environment variables, Docker, and **AI (summaries, practice exams, roadmap for PDF/YouTube)**.

## Run locally

```bash
npm install
npm run dev
```

Vite dev server proxies API routes to the backend (see `vite.config.ts`).

## Build

```bash
npm run build
```

## Home page flows

- **Select** mode: multi-select notes and/or folders, then **Generate AI Summary** or **Generate practice exam** (or delete).
- **Calendar** view: items by creation date; optional **important date** markers from the latest recording transcript (browser storage — see root README).

Original UI bundle reference: [Figma — Website Design](https://www.figma.com/design/LfOZxnvKZ86AC93CVrZ1Nt/Website-Design).
