# Viewer Page — Product Specification

---

## Overview

The Viewer Page is a read-only document viewing environment. It is reached from two different entry points, each of which produces a different version of the page. All files displayed here are already saved to MongoDB and cannot be modified by the user from this page under any circumstances.

---

## Entry Points

### Entry Point A — Post-Recording Flow
The user finishes a recording session and taps **Finish**. All files (AI summary, transcript, key terms, study questions) have been processed and saved to MongoDB before this page loads. The user arrives at the Viewer Page automatically.

### Entry Point B — Home Page Selection Flow
The user is on the Home page, selects one or more files or directories from their saved sessions, and chooses to generate a new summary or simply open a file. They are then routed to the Viewer Page. What they see depends on what they selected.

---

## Navigation

**Top-left corner:** A back button (arrow icon + app logo/name) that returns the user to the Home page. Subtle and unobtrusive — focus stays on the document content.

---

## Page Layout

The page uses a two-column layout: a fixed left sidebar and a scrollable center content area. The layout is the same across both entry points — only the contents of the sidebar and the default loaded file change.

---

## Left Sidebar — File Directory

### Purpose
Shows the user what files are available in this viewing session and lets them switch between them.

### Universal Behavior (both entry points)
- Clicking a file in the sidebar loads it into the center content area.
- The currently active file is highlighted (subtle background tint or left border accent).
- No file opens in an editable state — clicking only switches the viewer.
- The sidebar is fixed while the document scrolls.

---

### Sidebar — Entry Point A (Post-Recording)

The sidebar header shows the session name and date/time of the recording.

Files are listed in this order:

1. **AI Summary** *(auto-loaded on arrival)*
2. **Full Transcript**
3. **Key Terms & Definitions** *(if generated)*
4. **Study Questions** *(if generated)*

Files that were not generated for this session either do not appear or appear grayed out and unclickable with a label like "Not generated."

---

### Sidebar — Entry Point B (Home Page Selection)

The sidebar reflects exactly what the user selected on the Home page — nothing more.

**Scenario 1 — User selected a single file:**
The sidebar shows only that one file. It is auto-loaded and highlighted. The sidebar is minimal — essentially just confirming what is open.

**Scenario 2 — User selected multiple files from different sessions:**
The sidebar lists each selected file individually. Files may be grouped by their source session if they come from different recordings, with the session name as a small section label above each group.

**Scenario 3 — User selected one or more directories and generated a new cross-session summary:**
The sidebar shows:
- **Generated Summary** at the top *(auto-loaded on arrival)* — clearly labeled as newly generated, not a stored recording file
- Below it, the source files or directories that were used to generate it, listed for reference. These are also viewable but secondary.

The sidebar header in Entry Point B shows context-appropriate text — e.g., "Selected Files" or "Generated Summary" — rather than a specific recording session name.

---

## Center Content Area — Document Viewer

### Read-Only Enforcement
- Content is rendered as non-editable text. No cursor, no toolbar, no edit mode.
- No formatting bar, no edit button, no way to invoke editing.
- This is enforced at the UI level — the files are already locked in MongoDB.

### Visual Style
- The document is displayed on a white "paper" card, centered on the page, with generous padding — mimicking the feel of a Google Doc.
- The page background behind the card is very light gray or off-white, giving the card a sense of depth.
- A soft, subtle shadow on the card adds slight elevation without being heavy.
- Typography is clean and legible — good line height, constrained line length, never full-width.

### Content Rendering
Text files render with appropriate hierarchy — headings, paragraphs, bullet points — based on the file's structure. The AI Summary and Generated Summary both use this same rendering treatment.

### Scrolling
The document scrolls vertically within the content area. The sidebar remains fixed.

---

## Generated Summary — Visual Distinction

When the user arrives via Entry Point B with a freshly generated cross-session summary, the summary should be visually distinguishable from a stored recording file. This communicates that what they're looking at was just created from their selection, not retrieved from a past session.

Suggested treatments:
- A small label or badge at the top of the document card — e.g., "Generated from X sources" — in a subtle accent color.
- The sidebar entry for the generated summary uses a slightly different icon than standard session files (e.g., a sparkle or document-with-lines icon).

This is a light touch — the distinction should be informative, not visually dominant.

---

## Page States

**Loading:** A minimal loading indicator (spinner or skeleton) while files are fetched from MongoDB. Appears in the content area, not full-screen.

**Single file, no sidebar needed:** When only one file is open (Entry Point B, single file selection), the sidebar can be collapsed or hidden entirely, giving the document more breathing room. Optionally, a small toggle lets the user reveal the sidebar if they want context.

**Empty / error:** If a file fails to load, show a clean inline message in the content area: "This file couldn't be loaded. Please try again." Not a full-page error.

**File not generated:** Optional files that don't exist for a session either hide from the sidebar or appear grayed out and unclickable with a "Not generated" label.

---

## Summary of Differences by Entry Point

| | Entry Point A (Post-Recording) | Entry Point B (Home Selection) |
|---|---|---|
| **Sidebar header** | Session name + date | "Selected Files" or "Generated Summary" |
| **Files shown** | All files from that recording session | Only what the user selected |
| **Auto-loaded file** | AI Summary | Generated Summary or the single selected file |
| **File count** | Always multiple | Could be one or many |
| **Generated summary badge** | Not shown | Shown when a new summary was generated |
| **Sidebar visibility** | Always visible | May collapse if only one file is open |

---

## Design Principles

- **Read-only is the rule.** The interface communicates — visually and functionally — that this is a viewing experience. No affordances for editing exist anywhere on the page.
- **The content is the focus.** No clutter, no unnecessary controls. The document floats in clean space.
- **Context adapts to how the user arrived.** The sidebar and header respond intelligently to the entry point — a single file feels different from a full session, and that difference is reflected in the layout.
- **Calm and trustworthy.** The page should feel like a clean, organized notebook — reliable, easy to read, and nothing surprising.