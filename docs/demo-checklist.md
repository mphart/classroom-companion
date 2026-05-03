# Classroom Companion — demo script and checklist

**Theme:** accessibility for students — making lectures easier to follow, understand, and study from.

Use this doc for hackathon demos, QA passes, or onboarding. Each section pairs **Say:** narration you can read or paraphrase with **Do:** checklists you can tick live. Deeper stack and troubleshooting: [`agent-reference.md`](./agent-reference.md). Product overview and env: [`README.md`](../README.md).

**Target length:** about 5 minutes (Introduction ~30s, About ~45s, Features ~3–4m, Closing ~30s).

---

## Introduction (~30s)

**Say:**

> Lectures move fast. If you’re hard of hearing, learning in a second language, new to the jargon, or you just struggle to keep every date and detail in your head, the same class can feel like a wall. We built **Classroom Companion** so more students can actually access what’s being taught — **during** the lecture and **after**, when it’s time to study.
>
> I’m [your name] with [teammates — see Authors in README]. In the next few minutes I’ll show how every major feature ties back to **accessibility for students**.

**Do — pre-demo setup:**

- [ ] App reachable (e.g. `http://localhost:8080` with Docker, or your dev URL).
- [ ] Signed in as a **demo account** with a **course folder** that already has at least one **saved lecture note** (transcript text) and optionally a **slide PDF** note for a snappier walk-through.
- [ ] Root `.env` (or API env) has **`JWT_SECRET`**, **`GEMINI_API_KEY`** (summaries, single-note summarize, Session Q&A, live glossary, flashcard generation).
- [ ] **`PRACTICE_API_KEY`** set for practice exam **generate** and **short-answer grading** (can match `GEMINI_API_KEY` or be separate).
- [ ] **`DEEPGRAM_API_KEY`** for **English** live STT on `/recording`; **`GLADIO_API_KEY`** (or `GLADIA_API_KEY`) if you will demo a **non-English** lecture language with Gladia.
- [ ] Optional: **`SLIDESHOW_API_KEY`** for live **slide sync** quota isolation; if unset, slide sync uses `GEMINI_API_KEY` (see [README](../README.md)).
- [ ] Browser: mic permission allowed; one clean tab; speakers know **cooldowns** (~12s for Session Q&A and live glossary bursts).

---

## About (~45s)

**Say:**

> **Classroom Companion** is a web app for **recording lectures**, **organizing** courses and notes, **live speech-to-text** with optional translation, and **AI study tools** — summaries, practice exams, and flashcards — powered by **Google Gemini**.
>
> Under the hood it’s a **React + Vite** frontend, **Express** API, **MySQL** database, **JWT** auth, **Deepgram** for English streaming transcription, and **Gladia** for other languages with live translation into the language you pick. The point isn’t the stack for its own sake — it’s that we’re combining **captions**, **language support**, **plain-language help**, and **structured study outputs** so the benefits strong note-takers already have are available to **every** student.

**Do:**

- [ ] If judges ask “what’s it built on?”, you can point to [`README.md`](../README.md) repo structure and [`agent-reference.md`](./agent-reference.md) stack table.

---

## Features (~3–4 min)

Walk in order: **Home** (`/home`) → **Recording** (`/recording`) → back to **Home** / **calendar** → **Viewer** (`/viewer`) → selection flows on Home → **Practice Exam** (`/practice-exam`) → **Flashcards** (`/flashcards`). Toggle **theme** when it fits your pacing.

### Auth, Home library, and organization

**Say:**

> First, every student needs a place where their materials don’t disappear into chaos. Home is your library: folders, search, sort, list and grid and calendar views, and you can drag items between folders or bulk-select. That lowers the cognitive load of “where did I put that?” before we even hit AI.

**Do:**

- [ ] **Sign up** or **log in**; confirm session survives a refresh if you want to show persistence.
- [ ] **Log out** works and protected routes behave as expected (optional if short on time).
- [ ] **Folders** — create; open; use parent / breadcrumb / “up” (`..`) to navigate.
- [ ] **Note types** visible — lecture notes, **AI summary** notes, **practice exam** notes, **flashcards** notes, **slide PDF** notes (icons/labels distinguish types).
- [ ] **Views** — **list**, **grid**, **calendar**; content stays consistent.
- [ ] **Search** and **sort** behave as expected.
- [ ] **Open** a text/summary note → **Viewer**; open a generated practice exam → **Practice Exam**; open flashcards → **Flashcards** (`?noteId=…` where applicable).
- [ ] **Drag-and-drop** — move a note or folder; move an item up to parent via drop target if shown.
- [ ] **Selection mode** — multi-select; **bulk delete** updates the library (only if you’re OK deleting demo data).
- [ ] **Upload slide PDF** — Home header **Upload PDF** (next to **Record**, in “Create in this folder”); choose a `.pdf` file; PDF appears as a note in the current folder.

**Accessibility tie-in:** *Predictable organization, multiple layouts, and quick retrieval support students with executive-function challenges, anxiety about losing materials, or who need a calmer visual scan of “what’s due.”*

---

### Recording — captions, notes, save destination

**Say:**

> This is where accessibility hits in real time. While the instructor talks, we show a **live transcript**. In English that’s **Deepgram**; in other languages we use **Gladia** with translation so the transcript can match how the student learns. Side notes and a timer keep one session coherent, and when we save, we put the recording exactly where the student’s course lives — not dumped at a random root.

**Do:**

- [ ] Go to **`/recording`**. **Session timer** runs during the session.
- [ ] **Side notes** — type a few lines alongside the session.
- [ ] **Live transcript** — with keys set, partial/final text updates (English: Deepgram; non-English path: Gladia — see [README](../README.md)).
- [ ] **Lecture language** — if demoing both paths, switch English vs non-English and confirm the intended provider behavior.
- [ ] **Save destination** — **Save recording** to **library root** or a **course folder** (inline folder creation if offered).
- [ ] After save, **Home** shows the new note under the chosen location with transcript/metadata.

**Accessibility tie-in:** *Live captions support d/Deaf and hard-of-hearing students and anyone in a noisy room; translation supports ESL and international learners; structured save reduces post-class scramble.*

---

### Session Q&A and live glossary

**Say:**

> Not everyone can raise a hand mid-lecture. **Session Q&A** lets you ask a question against the **recent transcript window** and get an answer from the same AI stack as summaries. **Live glossary** watches new transcript text and surfaces **jargon chips** with short definitions — like a domain co-pilot. Both are rate-limited so we stay respectful of cost and the classroom flow.

**Do:**

- [ ] Under the live transcript, open **Session Q&A** — ask a question → **Ask**; wait for answer (~**12s** cooldown between asks per user).
- [ ] **Live glossary** — after enough new words (~**12s** cadence when eligible), **jargon chips** with definitions appear; session-only, server rate-limits.

**Accessibility tie-in:** *Q&A helps students who are shy, need processing time, or miss a spoken clarification; glossary lowers the barrier when instructors assume prior vocabulary.*

---

### Important dates and calendar

**Say:**

> After you save a recording, we **heuristically** scan the transcript for things that sound like exams or due dates. They can surface on the **calendar** view and sometimes a one-time browser alert. It’s best-effort — we always tell students to confirm against the syllabus — but it’s another nudge for students who lose track of deadlines.

**Do:**

- [ ] **Calendar** view on Home; **filters** / toggles (e.g. flashcards visibility) if exposed.
- [ ] If you saved a recording whose transcript mentions exam-like or due-date-like phrases, check **calendar** and/or **localStorage**-backed alert behavior (best-effort).

**Accessibility tie-in:** *Supports executive function and working-memory limits — “when is this actually due?” without relying solely on hearing every date aloud.*

---

### Slide PDFs, Viewer, and live slide sync

**Say:**

> Some students need to **see** the deck, not just hear it. Slide PDFs become first-class notes: you can view the PDF in the viewer, see extracted text for transparency, and on the recording page you can attach a deck for **live slide sync** — the app tries to match what’s on screen to what was just said. That’s multimodal access: ears, eyes, and text.

**Do:**

- [ ] Open a **slide PDF** note in **`/viewer`** — embedded PDF via authenticated blob; **extracted text** section if present.
- [ ] **Markdown + GFM** and **KaTeX** — open an AI summary or note with `$$ … $$` / `$ … $` math; confirm math renders.
- [ ] **`/viewer?noteId=…`** deep link after auth.
- [ ] On **`/recording`**, if product flow supports it: attach slide deck and show **live slide sync** (requires `SLIDESHOW_API_KEY` or `GEMINI_API_KEY` per [README](../README.md)).

**Accessibility tie-in:** *Aligns spoken content with visual slides and readable text — helpful for visual learners, students who miss a slide flip, or those pairing captions with deck context.*

---

### AI summaries (Home selection and single-note)

**Say:**

> Long transcripts are still a lot to read. **AI summaries** turn lectures into structured **Markdown** in the viewer — you can summarize **one** note from the viewer or **many** notes and whole folders from Home. The API can infer output language from **lecture recordings** when appropriate; summaries also favor **instructor-led** content over student chatter in mixed rooms.

**Do:**

- [ ] **Multi-note / folder summary** — Home → **Select** → pick notes and/or folders → **Generate AI Summary** → new **generated summary** note opens in Viewer (`GEMINI_API_KEY`).
- [ ] **Single-note summary** — Viewer on a lecture note → **Generate AI summary**; summary appears.
- [ ] **Regenerate** if the UI offers it; note updates.
- [ ] **Generated summary** layout reads cleanly for the “AI summary” source type.

**Accessibility tie-in:** *Shorter, structured text reduces reading load for dyslexia, ADHD, fatigue, or anyone who missed class and needs a second pass in a calmer format.*

---

### Practice exam

**Say:**

> Tests are another accessibility barrier — not everyone has someone to drill them. From Home you select materials and **generate a practice exam**: multiple choice plus short answer. Multiple choice grades locally; short answers get **AI feedback** so it’s low-stakes practice with a real feedback loop.

**Do:**

- [ ] Home → **Select** → **Generate practice exam** (configure counts/types if dialog shown) → new note; **`/practice-exam`** opens.
- [ ] **Multiple choice** — select options; **short answer** — enter text.
- [ ] **Check answers** — MC local grade; short answers receive **AI feedback** (`PRACTICE_API_KEY`).
- [ ] **Back** — library / browse context preserved when `browseDirectory` state is passed.

**Accessibility tie-in:** *Low-stakes retrieval practice and immediate explanation reduce test anxiety and support self-paced mastery without needing a human tutor in the room.*

---

### Flashcards

**Say:**

> Some students learn better in **small chunks**. Flashcard decks are generated from the same selected sources, then you study with flip, navigation, shuffle, and simple filters like “still learning” vs “known” — ratings can be session-scoped, but the flow still gives an alternate modality from walls of text.

**Do:**

- [ ] Home → **Select** → **Generate flashcards** → new note; **`/flashcards`** study UI opens.
- [ ] **Deck loads** — term/definition from generated JSON.
- [ ] **Flip**, **next/previous**, **shuffle**, **filter** (e.g. All / Still learning / Known).
- [ ] **`/flashcards?noteId=…`** deep link works after navigation.

**Accessibility tie-in:** *Offers bite-sized, self-paced review — a different cognitive channel than prose summaries or exams.*

---

### Theme and shell

**Say:**

> Finally, small UI choices matter: **dark and light theme** so students can pick what’s easier on their eyes in different environments.

**Do:**

- [ ] **Theme** — toggle light/dark where **`ThemeToggle`** appears (e.g. with authenticated shell).

**Accessibility tie-in:** *Reduces eye strain and supports preference in low light, migraine sensitivity, or long study sessions.*

---

### Errors and infra (optional for judges)

**Say:**

> If API keys aren’t configured, we fail loudly with configuration errors instead of silent broken demos — important for honest shipping.

**Do:**

- [ ] With keys unset (in a staging branch if needed), summary vs practice vs STT show **clear configuration** errors in the UI.
- [ ] **Docker Compose** — `web` + `api` + `db`; SPA on `WEB_PORT` (default **8080**); API same-origin via Nginx.
- [ ] **`/health`** responds when demoing a deployed stack.
- [ ] **WebSocket STT** — `/transcription/stream` upgrades; audio flows (see [agent-reference.md](./agent-reference.md) for dev vs Docker caveats).

---

## Closing (~30s)

**Say:**

> We didn’t bolt “accessibility” onto one feature. **Captions** and **translation** address hearing and language. **Glossary** and **Q&A** address vocabulary and participation barriers. **Summaries**, **practice exams**, and **flashcards** address attention, reading load, and test readiness. **Calendar nudges** and **organization** address executive function. **Theme** and **multimodal slides** address vision and how different brains process the same lecture.
>
> **Accessibility for students** here means: the lecture stops being a single one-size-fits-all firehose, and becomes something you can **follow**, **decode**, and **study** on your own terms.
>
> On the roadmap we’re finishing **PDF and YouTube as direct sources** for AI summaries and practice exams — until that ships, selection flows use **saved notes** on Home (see [README](../README.md) roadmap). Thanks — questions?

**Do:**

- [ ] **Roadmap** — mention PDF/YouTube as in progress; demo selection flows from **saved notes** unless that work has shipped.
- [ ] Thank the audience and offer Q&A.

---

## Quick reference — routes

| Route | Page |
| --- | --- |
| `/`, `/signup` | Login / Sign up |
| `/home` | Library (folders, views, selection, AI from selection) |
| `/recording` | Active recording, STT, Q&A, glossary, slide sync |
| `/viewer` | Note viewer, Markdown, PDF slides, single-note summarize |
| `/practice-exam` | Interactive practice exam |
| `/flashcards` | Flashcard study UI |

---

## QA-only appendix (flat checklist)

Use this block for a quick regression pass without the script.

- [ ] Auth: sign up, log in, log out, theme toggle.
- [ ] Home: folders, views, search, sort, open Viewer / Practice Exam / Flashcards, DnD, select, bulk delete, upload PDF.
- [ ] Calendar filters; important dates heuristic after save.
- [ ] Recording: timer, side notes, transcript, language path, save destination, saved note.
- [ ] Session Q&A; live glossary.
- [ ] Viewer: `?noteId=`, Markdown/GFM, KaTeX, slide PDF, single-note summary, regenerate, jump to practice exam from exam note.
- [ ] Home AI: multi-note/folder summary, practice exam, flashcards; errors without keys.
- [ ] Practice Exam: MC, SA, check answers, back navigation.
- [ ] Flashcards: load, flip, next/prev, shuffle, filter, deep link.
- [ ] Optional: Docker, health, WebSocket STT; roadmap PDF/YouTube callout.
