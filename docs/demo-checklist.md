# Demo checklist

Walk-through checklist covering shipped features in Classroom Companion. Use for hackathon demos, QA passes, or onboarding.

---

## Auth and shell

- [ ] **Sign up** — new account creates a session and lands in the app.
- [ ] **Log in** — existing user; JWT/session persists across refresh.
- [ ] **Log out** — session cleared; protected routes redirect appropriately.
- [ ] **Theme** — toggle light/dark via the global theme control (layouts that show `ThemeToggle`).

---

## Home — library and navigation

- [ ] **Folders** — create folder; open folder; breadcrumb / “up” to parent works.
- [ ] **Note types visible** — lecture/recording notes, **AI summary** notes, **practice exam** notes, **flashcards** notes, **slide PDF** notes (icons / labels distinguish types).
- [ ] **Views** — switch **list**, **grid**, and **calendar**; content stays consistent.
- [ ] **Search** — filter notes/folders by query.
- [ ] **Sort** — change sort order; order updates as expected.
- [ ] **Open note** — opens **Viewer** for text/summary/PDF-backed notes as appropriate.
- [ ] **Open generated practice exam** — routes to **Practice Exam** flow.
- [ ] **Open generated flashcards** — routes to **Flashcards** (`?noteId=…`).

---

## Home — organization and bulk actions

- [ ] **Drag-and-drop** — move a note or folder into another folder (and move item up to parent if supported in UI).
- [ ] **Selection mode** — multi-select items.
- [ ] **Bulk delete** — selected items removed; library updates.
- [ ] **Upload slide PDF** — PDF becomes a note; appears in library in the current folder.

---

## Home — calendar and important dates

- [ ] **Calendar filters** — toggles for which generated types appear on the calendar (e.g. summaries vs flashcards), if exposed.
- [ ] **Important dates** — after saving a recording with exam/due-date-like phrases, heuristic dates can appear on the calendar and/or a browser alert (localStorage — behavior is best-effort).

---

## Recording (`/recording`)

- [ ] **Session timer** — runs during a session.
- [ ] **Side notes** — capture side notes alongside the session.
- [ ] **Live transcript** — with **Deepgram** (English) or **Gladia** (non-English path), transcript updates in near real time when keys/env are set.
- [ ] **Lecture language** — English vs non-English path uses the intended provider (see [README](../README.md)).
- [ ] **Save destination** — **Save recording** targets **library root** or a **chosen course folder** (including inline folder creation if offered).
- [ ] **Saved note** — transcript (and metadata) appears on Home under the chosen location.

---

## Recording — Session Q&A and live glossary

- [ ] **Session Q&A** — ask a question against the **recent transcript window**; answer returns (Gemini); respect cooldown (~12s) if firing multiple requests quickly.
- [ ] **Live glossary** — new transcript chunks can surface **jargon chips** with short definitions; updates are session-only and rate-limited.

---

## Viewer (`/viewer`)

- [ ] **Load by URL** — `/viewer?noteId=…` loads the note after auth.
- [ ] **Markdown + GFM** — headings, lists, tables, links render in **AI summary** and raw text areas.
- [ ] **LaTeX / math** — display math in `$$ … $$` (and inline `$ … $` if used) renders via KaTeX, not as raw delimiters.
- [ ] **Slide PDF note** — embedded PDF loads from the API blob; error state if PDF fails.
- [ ] **Single-note AI summary** — **Generate AI summary** on a lecture note with text/transcript; summary appears (requires `GEMINI_API_KEY`).
- [ ] **Regenerate** — re-run summary if the UI offers it; note updates.
- [ ] **Generated summary note** — dedicated layout for “AI summary” source type reads cleanly.
- [ ] **Jump to practice exam** — from a generated exam note, navigation to the interactive exam works.

---

## AI from Home — selection flows

- [ ] **Multi-note / folder summary** — Select → include folders (nested notes) and/or notes → **Generate AI Summary** → new **generated summary** note opens in viewer.
- [ ] **Practice exam** — Select → **Generate practice exam** (dialog: counts / types if shown) → new note; opens **Practice Exam** page.
- [ ] **Flashcards** — Select → **Generate flashcards** → new note; opens **Flashcards** study UI.
- [ ] **Errors without keys** — with API keys unset, summary vs practice endpoints return a clear **configuration** error in the UI.

---

## Practice Exam (`/practice-exam`)

- [ ] **Load exam JSON** — title and questions render.
- [ ] **Multiple choice** — select options per question.
- [ ] **Short answer** — free text per question.
- [ ] **Check answers** — MC graded locally; short answers get **AI feedback** (requires `PRACTICE_API_KEY` / grading endpoint).
- [ ] **Navigation** — back to library / browse context preserved if the app passes `browseDirectory` state.

---

## Flashcards (`/flashcards`)

- [ ] **Deck loads** — term/definition cards from generated note JSON.
- [ ] **Flip** — front/back interaction.
- [ ] **Next / previous** — move through the deck.
- [ ] **Shuffle** — order changes.
- [ ] **Filter** — e.g. all vs learning vs known (if you use ratings during demo).
- [ ] **Deep link** — `?noteId=` works after navigation.

---

## Infra / regression (optional)

- [ ] **Docker Compose** — `web` + `api` + `db`; SPA loads on configured port; API proxied same-origin.
- [ ] **Health** — API health route responds when demoing deployed stack.
- [ ] **WebSocket STT** — in Docker or dev proxy, `/transcription/stream` upgrades and audio flows (see [agent-reference.md](./agent-reference.md) for dev caveats).

---

## Roadmap callout

- [ ] **PDF / YouTube as direct AI sources** — [README](../README.md) marks this as in progress; demo should stick to **saved notes** for selection-based summary/exam unless that work has shipped.
