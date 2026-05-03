import type { AuthUser, CreateNoteInput, Item, Note, SortBy, SortDir, User } from "../types";

export interface ListItemsParams {
  userId: number;
  directoryPath: string;
  query?: string;
  sortBy?: SortBy;
  sortDir?: SortDir;
}

export interface Repository {
  createUser(input: { name: string; username: string; passwordHash: string }): Promise<User>;
  findUserByUsername(username: string): Promise<User | null>;
  findUserById(id: number): Promise<AuthUser | null>;
  listItems(params: ListItemsParams): Promise<Item[]>;
  createFolder(input: { userId: number; name: string; directoryPath: string }): Promise<Item>;
  renameItem(input: { userId: number; itemId: number; newName: string }): Promise<Item | null>;
  deleteItems(input: { userId: number; itemIds: number[] }): Promise<number>;
  createNote(input: CreateNoteInput): Promise<{ item: Item; note: Note }>;
  getNoteById(input: { userId: number; itemId: number }): Promise<{ item: Item; note: Note } | null>;
  listNotes(input: { userId: number; directoryPath?: string }): Promise<Array<{ item: Item; note: Note }>>;
  updateNoteSummary(input: { userId: number; itemId: number; summary: string }): Promise<{ item: Item; note: Note } | null>;
  collectSummarySources(input: { userId: number; noteIds: number[]; folderIds: number[] }): Promise<{
    texts: string[];
    sourceCount: number;
    /** When every source note shares the same `language` (e.g. all "Spanish"), use for AI summary output. */
    summarizeLanguage: string | null;
  }>;
}
