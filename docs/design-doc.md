# ClassroomCompanion — Design Document

---

## 1. Product Overview

**App Name:** ClassroomCompanion

**Problem:** Lectures are a fundamentally passive, one-speed information delivery format — the professor controls the pace, not the learner. This creates a gap between information delivered and information retained. That gap is dramatically wider for students with ADHD, ESL backgrounds, learning disabilities, or those who are first-generation college students.

**Solution:** ClassroomCompanion turns lecture audio into organized, accessible, AI-enhanced notes in real time. It is a one-stop shop for classroom accessibility — recording, organizing, summarizing, and preparing students for exams, all in one place.

---

## 2. Target Users

- Students who are underrepresented — including those with ADHD, ESL backgrounds, learning disabilities, and first-generation college students.
- Students at universities who struggle to keep up with fast-paced lectures, whether due to the volume of information, unfamiliar terminology, or simply the challenge of absorbing and retaining complex material in real time.

---

## 3. Design Vibe

The website should feel **inviting and trustworthy** — something students genuinely want to open every day for crucial tasks like studying and planning. It should never feel intimidating, cluttered, or corporate.

**Tone:** Clean, calm, academic — not sterile. Think a well-organized notebook, not an enterprise dashboard.

**UI Principles:**
- Prioritize readability and focus. Remove anything that doesn't serve the user's immediate task.
- Consistent spacing, clear hierarchy, and soft color choices that are easy on the eyes during long study sessions.
- Interactions should feel smooth and responsive — especially on the recording page, which is the core feature.
- Mobile-aware, but desktop-first. Students will primarily use this on a laptop during or after lecture.

**Tech Stack:**
- Frontend: TypeScript + React + TailwindCSS + Vite
- No inline CSS unless absolutely necessary. All styling via Tailwind utility classes.
- Backend: Node.js + Express
- Database: MySQL
- Speech-to-Text: Deepgram (https://deepgram.com) — real-time streaming via WebSocket
- AI Summarization: Cursor API

---

## 4. Core Features (MVP)

### Account Creation & Authentication
Lectures are saved per user. Each user has their own account with a username and password. Authentication gates all content — nothing is accessible without being logged in.

### Speech to Text (Core Feature)
Users open the site, begin a recording session, and the site converts speech to text live via WebSocket. The raw transcript is saved automatically. Users can pause, resume, and stop the recording. Text can be edited at any time after the recording ends.

### Organization
Students organize lectures into folders by class or course. Each item (file or folder) belongs to a directory path tied to the user's account. Folders and notes display their last edited date.

### AI Tools
All AI features are powered by the **Cursor API**.
- Summarize and simplify a lecture session
- Translate to other languages (language selected before recording starts)
- Filter out irrelevant commentary (e.g., background student chatter)
- Generate key terms, definitions, and study questions from a transcript

### Exam Prep
Users can select multiple notes or folders and generate a consolidated summary for exam preparation. This summary is saved as a new item in the current directory and opens immediately in the Viewer Page.

### Saving
Each recording session saves three versions of the content:
1. Raw uncut transcript text
2. Edited text with user comments
3. AI-generated summary

---

## 5. Stretch Goals

These are not MVP priorities but should be accounted for in architecture decisions now so they can be added without requiring a rebuild.

| Feature | Description |
|---|---|
| Prerecorded videos | User uploads videos, YouTube links, or audio files — same note features apply |
| Student Planner | Calendar-style planner where users can attach notes and recordings to events |
| Slides & Documents | Upload slides or PDFs alongside a recording session |
| Important Info Alerts | AI flags high-priority mentions (e.g., exam dates, "this will be on the test") |
| User Side Notes | Separate note-taking tab that can be included in AI tools and exam prep |

---

## 6. User Flow

```
Sign Up → Log In → Home Page → Start Recording → Active Recording Page
→ Stop Recording → Viewer Page (AI Summary auto-loads)
→ Back to Home Page → Select files/folders → Generate Exam Prep Summary
→ Viewer Page (Generated Summary auto-loads)
```

---

## 7. Page Specifications

---

### 7.1 Login Page

**Layout:** Split screen — logo panel on the left, form on the right.

**Left Panel:**
- App logo, large and centered, given generous breathing room.
- Visually rich background — a distinct color or texture that sets the tone for the brand.
- Static — does not change between Login and Signup.

**Right Panel — Form:**
- Centered vertically and horizontally within the right half.
- Heading: **"Welcome back."**
- Subtext: *Sign in to your account.*
- Fields:
  - Username
  - Password (hidden input)
- Primary button: **Log In** — full width, primary accent color.
- Secondary link below button: *Don't have an account?* **Sign up**

**What is not on this page:**
- No forgot password link (stretch goal)
- No social login buttons
- No remember me checkbox

**Validation:**
- Empty field or wrong credentials → inline error beneath the relevant field (red border + message)
- Button shows loading spinner during request
- On success → routes to Home Page

---

### 7.2 Signup Page

**Layout:** Same split-screen as Login. Left panel is identical.

**Right Panel — Form:**
- Heading: **"Create your account."**
- Subtext: *It only takes a moment.*
- Fields (in order):
  1. Name
  2. Username
  3. Password (hidden input)
- Primary button: **Create Account** — same style as Login button.
- Secondary link: *Already have an account?* **Log in**

**What is not on this page:**
- No confirm password field
- No email field (username-only auth for MVP)
- No terms of service checkbox

**Validation:**
- Same inline error behavior as Login.
- On success → routes to Home Page.

---

### 7.3 Home Page

**Purpose:** The main hub. Users access all their recordings and folders, start new recordings, and initiate exam prep summaries from here.

**Top Bar:**
- Top left: **+ New** button — dropdown with "Start New Recording" and "Add New Folder"
- Top right: **Profile button** — dropdown with Logout option
- Below top bar: **Search bar** — filters items in the current directory (case-insensitive)
- Next to search: **Filter/Sort button** — options for Name, Last Edited Date, Creation Date

**Directory Structure:**
- Root: `userId/`
- Example nested path: `userId/physics/chapter3/`
- App tracks current directory and displays all items within it
- Each item shows its name and last edited date beneath it

**File/Folder Behavior:**
- Clicking a **folder** → navigates into that folder
- Clicking a **note** → opens Viewer Page
- **Folder creation:** New folder appears with a blank editable name. If user clicks away without entering a name, defaults to `"untitled"`. On confirm (Enter or click away) → POST request sent with folder name and creation date.

**Selection Mode:**
- Activated by clicking the selection checkbox (top left of content area)
- Allows selecting multiple notes and folders
- Actions when items are selected:
  - **Generate Summary** — creates an AI summary from all selected content, saves it to current directory, opens in Viewer Page
  - **Delete**
  - **Rename** (only when exactly one item is selected)
- Clicking outside items deselects all
- Clicking a selected item deselects it

---

### 7.4 Active Recording Page

**Purpose:** The core feature of the app. Must be performant, visually clean, and extremely easy to use under real lecture conditions. Three sections: Notes, Settings, and Live Recording.

**Notes Section:**
- Header: "Enter Notes" (or similar)
- Basic text editor area beneath the header
- Each line gets a small bullet point
- Pressing Enter creates a new bullet on the next line
- Text wraps within a line without generating a new bullet
- If notes overflow the visible area, the section scrolls down automatically as the user types

**Settings Section:**
- Top: App name/logo — acts as a button back to the Home Page
- Settings list:
  - **Lecture name field** — editable text, defaults to `Lecture-<dd-mm>` (e.g., `Lecture-01-01` for January 1st)
  - **Course dropdown** — select which course/folder to save to. Bottom option: "Create New Course" → opens a popup with a single name input field
  - **Language selector** — dropdown for output language. Defaults to English. Can only be changed before recording starts for the first time.
- Bottom: Home button (secondary navigation, same destination as the logo at the top)

**Recording Section:**
- Displays live transcribed text as it is generated
- New text appends to the bottom; view auto-scrolls to follow
- **Start button** — disabled until a course is selected (or prompts on Stop if no course was chosen)
  - On click: requests microphone access, opens WebSocket connection to backend, begins streaming audio
  - Backend streams audio to Deepgram's real-time API (https://deepgram.com) in the selected language
  - Deepgram returns transcribed text; backend forwards it to the frontend via WebSocket
  - Text streams back and appends to the live display
- **Stop button** — ends recording, saves the session, routes user to the Viewer Page
- **Timer** — displays elapsed recording time (mm:ss format), starts when recording begins

---

### 7.5 Viewer Page

**Purpose:** A read-only environment where users review files generated from a recording session or selected from the Home Page. All content is already saved to MongoDB — nothing can be edited here.

**Navigation:**
- Top left: Back button → Home Page

**Layout:** Fixed left sidebar + scrollable center content area.

---

#### Entry Point A — Post-Recording

User arrives here automatically after stopping a recording.

**Sidebar:**
- Header: Session name + recording date/time
- Files listed in order:
  1. AI Summary *(auto-loaded)*
  2. Full Transcript
  3. Key Terms & Definitions *(if generated)*
  4. Study Questions *(if generated)*
- Files not generated: hidden or grayed out with "Not generated" label

---

#### Entry Point B — Home Page Selection

User arrives here after selecting files/folders on the Home Page and generating a summary, or by clicking a single file.

**Scenario 1 — Single file opened:**
- Sidebar shows only that one file, highlighted
- Sidebar may auto-collapse to give the document more space
- A toggle lets the user reveal the sidebar if desired

**Scenario 2 — Multiple files selected (no new summary generated):**
- Sidebar lists each selected file
- Files from different sessions are grouped by session name (small label above each group)
- First file auto-loads

**Scenario 3 — Directories/files selected and a new summary was generated:**
- Sidebar shows:
  - **Generated Summary** at the top *(auto-loaded)* — labeled "Generated from X sources" with a subtle badge/accent
  - Source files or folders listed below for reference, viewable but secondary
- Sidebar header reads: "Generated Summary" or "Selected Files"

---

#### Document Viewer (all entry points)

- White "paper" card, centered on the page, generous padding
- Light gray/off-white page background — card appears to float
- Soft shadow on the card for subtle elevation
- Constrained line length for readability (not full-width)
- Content renders with proper hierarchy: headings, paragraphs, bullet points
- No toolbar, no cursor, no edit affordances anywhere

**Page States:**
- **Loading:** Minimal spinner or skeleton in the content area (not full-page)
- **Error:** Inline message — "This file couldn't be loaded. Please try again."
- **Single file / no sidebar needed:** Sidebar collapses or hides; toggle available to reveal

---

## 8. Data Model (High-Level)

```
User
  ├── _id
  ├── name
  ├── username
  └── password (hashed)

Directory (Folder)
  ├── _id
  ├── userId
  ├── name
  ├── path (e.g., userId/physics/)
  ├── createdAt
  └── updatedAt

RecordingSession
  ├── _id
  ├── userId
  ├── directoryPath
  ├── lectureName
  ├── course
  ├── language
  ├── duration (seconds)
  ├── createdAt
  └── updatedAt

File
  ├── _id
  ├── sessionId
  ├── userId
  ├── directoryPath
  ├── type (raw_transcript | edited_transcript | ai_summary | generated_summary | key_terms | study_questions)
  ├── content (text)
  ├── createdAt
  └── updatedAt
```

---