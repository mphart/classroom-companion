export type ItemType = "folder" | "note";

export type SortBy = "name" | "lastEditedDate" | "creationDate";
export type SortDir = "asc" | "desc";

export interface User {
  id: number;
  name: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Item {
  id: number;
  userId: number;
  type: ItemType;
  name: string;
  directoryPath: string;
  createdAt: Date;
  updatedAt: Date;
  /** Present for `note` rows when enriched from the notes table (for UI listing). */
  noteSourceType?: Note["sourceType"] | null;
}

export type NoteSourceType =
  | "recording"
  | "generated_summary"
  | "generated_practice_exam"
  | "slide_pdf"
  | "generated_flashcards";

export interface Note {
  itemId: number;
  rawText: string;
  aiSummary: string | null;
  language: string;
  durationSeconds: number;
  sourceType: NoteSourceType;
  generatedFromCount: number | null;
  /** Relative path under the uploads root (MySQL); null for non-PDF notes. */
  pdfFilePath: string | null;
  /** Canonical watch URL when the note was created from YouTube parsing; otherwise null. */
  youtubeSourceUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthUser {
  id: number;
  username: string;
  name: string;
}

export interface CreateNoteInput {
  userId: number;
  title: string;
  directoryPath: string;
  rawText: string;
  /** When set (e.g. Gemini output), persisted to `notes.ai_summary` alongside `raw_text`. */
  aiSummary?: string | null;
  language: string;
  durationSeconds: number;
  sourceType?: NoteSourceType;
  generatedFromCount?: number | null;
  pdfFilePath?: string | null;
  youtubeSourceUrl?: string | null;
}
