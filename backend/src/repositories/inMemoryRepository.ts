import type { CreateNoteInput, Item, Note, User } from "../types";
import type { ListItemsParams, Repository } from "./repository";

const normalizePath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed.endsWith("/")) return `${trimmed}/`;
  return trimmed;
};

export class InMemoryRepository implements Repository {
  private users: User[] = [];
  private items: Item[] = [];
  private notes: Note[] = [];
  private userIdSeq = 1;
  private itemIdSeq = 1;

  async createUser(input: { name: string; username: string; passwordHash: string }): Promise<User> {
    const now = new Date();
    const user: User = {
      id: this.userIdSeq++,
      name: input.name,
      username: input.username,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(user);
    return user;
  }

  async findUserByUsername(username: string): Promise<User | null> {
    return this.users.find((u) => u.username === username) ?? null;
  }

  async findUserById(id: number) {
    const user = this.users.find((u) => u.id === id);
    if (!user) return null;
    return { id: user.id, name: user.name, username: user.username };
  }

  async listItems(params: ListItemsParams): Promise<Item[]> {
    const query = params.query?.toLowerCase();
    const dir = normalizePath(params.directoryPath);
    const tree = params.tree ?? false;
    let result = this.items.filter((i) => {
      if (i.userId !== params.userId) return false;
      if (!tree) return i.directoryPath === dir;
      return i.directoryPath === dir || i.directoryPath.startsWith(dir);
    });
    if (query) result = result.filter((i) => i.name.toLowerCase().includes(query));
    const sortBy = params.sortBy ?? "lastEditedDate";
    const sortDir = params.sortDir ?? "desc";
    result.sort((a, b) => {
      let delta = 0;
      if (sortBy === "name") delta = a.name.localeCompare(b.name);
      if (sortBy === "creationDate") delta = a.createdAt.getTime() - b.createdAt.getTime();
      if (sortBy === "lastEditedDate") delta = a.updatedAt.getTime() - b.updatedAt.getTime();
      return sortDir === "asc" ? delta : -delta;
    });
    return result.map((item) => {
      if (item.type !== "note") return item;
      const note = this.notes.find((n) => n.itemId === item.id);
      return {
        ...item,
        noteSourceType: note?.sourceType ?? "recording",
      };
    });
  }

  async createFolder(input: { userId: number; name: string; directoryPath: string }): Promise<Item> {
    const now = new Date();
    const item: Item = {
      id: this.itemIdSeq++,
      userId: input.userId,
      type: "folder",
      name: input.name,
      directoryPath: normalizePath(input.directoryPath),
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(item);
    return item;
  }

  async renameItem(input: { userId: number; itemId: number; newName: string }): Promise<Item | null> {
    const item = this.items.find((i) => i.id === input.itemId && i.userId === input.userId);
    if (!item) return null;
    if (item.type === "folder") {
      const oldPrefix = this.folderPrefix(item);
      const newPrefix = `${normalizePath(item.directoryPath)}${input.newName}/`;
      if (oldPrefix !== newPrefix) {
        for (const candidate of this.items) {
          if (candidate.userId !== input.userId || candidate.id === item.id) continue;
          const d = normalizePath(candidate.directoryPath);
          if (d.startsWith(oldPrefix)) {
            candidate.directoryPath = newPrefix + d.slice(oldPrefix.length);
            candidate.updatedAt = new Date();
          }
        }
      }
    }
    item.name = input.newName;
    item.updatedAt = new Date();
    return item;
  }

  private folderPrefix(folder: Item): string {
    return `${normalizePath(folder.directoryPath)}${folder.name}/`;
  }

  async deleteItems(input: { userId: number; itemIds: number[] }): Promise<number> {
    const roots = this.items.filter((i) => i.userId === input.userId && input.itemIds.includes(i.id));
    const toDelete = new Set<number>(roots.map((r) => r.id));
    const folderPrefixes = roots.filter((r) => r.type === "folder").map((f) => this.folderPrefix(f));
    if (folderPrefixes.length > 0) {
      this.items.forEach((candidate) => {
        if (candidate.userId !== input.userId) return;
        const parent = normalizePath(candidate.directoryPath);
        for (const prefix of folderPrefixes) {
          if (parent.startsWith(prefix)) toDelete.add(candidate.id);
        }
      });
    }
    this.items = this.items.filter((i) => !toDelete.has(i.id));
    this.notes = this.notes.filter((n) => !toDelete.has(n.itemId));
    return toDelete.size;
  }

  async createNote(input: CreateNoteInput): Promise<{ item: Item; note: Note }> {
    const now = new Date();
    const item: Item = {
      id: this.itemIdSeq++,
      userId: input.userId,
      type: "note",
      name: input.title,
      directoryPath: normalizePath(input.directoryPath),
      createdAt: now,
      updatedAt: now,
    };
    const note: Note = {
      itemId: item.id,
      rawText: input.rawText,
      aiSummary: input.aiSummary ?? null,
      language: input.language,
      durationSeconds: input.durationSeconds,
      sourceType: input.sourceType ?? "recording",
      generatedFromCount: input.generatedFromCount ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(item);
    this.notes.push(note);
    return { item, note };
  }

  async getNoteById(input: { userId: number; itemId: number }) {
    const item = this.items.find((i) => i.id === input.itemId && i.userId === input.userId && i.type === "note");
    const note = this.notes.find((n) => n.itemId === input.itemId);
    if (!item || !note) return null;
    return { item, note };
  }

  async listNotes(input: { userId: number; directoryPath?: string }) {
    const dir = input.directoryPath ? normalizePath(input.directoryPath) : undefined;
    const pairs = this.items
      .filter((i) => i.userId === input.userId && i.type === "note" && (!dir || i.directoryPath === dir))
      .map((item) => ({ item, note: this.notes.find((n) => n.itemId === item.id)! }));
    return pairs;
  }

  async updateNoteSummary(input: { userId: number; itemId: number; summary: string }) {
    const pair = await this.getNoteById(input);
    if (!pair) return null;
    pair.note.aiSummary = input.summary;
    pair.note.updatedAt = new Date();
    pair.item.updatedAt = new Date();
    return pair;
  }

  async collectSummarySources(input: { userId: number; noteIds: number[]; folderIds: number[] }) {
    const selectedNoteIds = new Set<number>(input.noteIds);
    const folders = this.items.filter(
      (i) => i.userId === input.userId && i.type === "folder" && input.folderIds.includes(i.id),
    );
    const folderPrefixes = folders.map((f) => this.folderPrefix(f));
    const folderNoteIds = this.items
      .filter((i) => i.userId === input.userId && i.type === "note")
      .filter((i) => folderPrefixes.some((prefix) => normalizePath(i.directoryPath).startsWith(prefix)))
      .map((i) => i.id);

    folderNoteIds.forEach((id) => selectedNoteIds.add(id));

    const texts = [...selectedNoteIds]
      .map((id) => this.notes.find((n) => n.itemId === id)?.rawText)
      .filter((value): value is string => Boolean(value));

    return { texts, sourceCount: texts.length };
  }
}
