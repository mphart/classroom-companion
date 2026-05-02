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

export interface Note {
  itemId: number;
  rawText: string;
  aiSummary: string | null;
  language: string;
  durationSeconds: number;
  sourceType: "recording" | "generated_summary";
  generatedFromCount: number | null;
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
  language: string;
  durationSeconds: number;
  sourceType?: "recording" | "generated_summary";
  generatedFromCount?: number | null;
}
