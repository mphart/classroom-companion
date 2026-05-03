import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import fs from "node:fs/promises";
import path from "node:path";
import { getPdfUploadRoot } from "../lib/uploadPaths";
import { HttpClientError } from "../lib/errors";
import { inferSelectionSummaryLanguage } from "../lib/inferSelectionSummaryLanguage";
import { isDirectoryUnderUserRoot, isFolderCreationBlockedInDirectory } from "../lib/itemPathDepth";
import { validateMoveItemContext } from "../lib/validateItemMove";
import type { AuthUser, CreateNoteInput, Item, Note, SortBy, SortDir, User } from "../types";
import type { ListItemsParams, Repository } from "./repository";

const normalizePath = (value: string): string => (value.endsWith("/") ? value : `${value}/`);

type ItemRow = RowDataPacket & {
  id: number;
  user_id: number;
  type: "folder" | "note";
  name: string;
  directory_path: string;
  created_at: Date;
  updated_at: Date;
  note_source_type?: "recording" | "generated_summary" | "generated_practice_exam" | "slide_pdf" | "generated_flashcards" | null;
};

type NoteRow = RowDataPacket & {
  item_id: number;
  raw_text: string;
  ai_summary: string | null;
  language: string;
  duration_seconds: number;
  source_type:
    | "recording"
    | "generated_summary"
    | "generated_practice_exam"
    | "slide_pdf"
    | "generated_flashcards";
  generated_from_count: number | null;
  pdf_file_path: string | null;
  created_at: Date;
  updated_at: Date;
};

export class MySqlRepository implements Repository {
  constructor(private readonly pool: Pool) {}

  /**
   * Applies incremental MySQL changes for `notes` (new `source_type` enum values, `pdf_file_path`).
   * Safe to call on every startup.
   */
  async ensureNotesSchema(): Promise<void> {
    const [typeRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notes' AND COLUMN_NAME = 'source_type'
       LIMIT 1`,
    );
    if (typeRows.length > 0) {
      const col = typeRows[0]?.COLUMN_TYPE;
      const needsUpdate =
        typeof col !== "string" ||
        !col.includes("generated_practice_exam") ||
        !col.includes("slide_pdf") ||
        !col.includes("generated_flashcards");
      if (needsUpdate) {
        await this.pool.execute(
          `ALTER TABLE notes MODIFY COLUMN source_type ENUM(
            'recording',
            'generated_summary',
            'generated_practice_exam',
            'slide_pdf',
            'generated_flashcards'
          ) NOT NULL DEFAULT 'recording'`,
        );
      }
    }

    const [pdfCols] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notes' AND COLUMN_NAME = 'pdf_file_path'
       LIMIT 1`,
    );
    if (pdfCols.length === 0) {
      await this.pool.execute(
        `ALTER TABLE notes ADD COLUMN pdf_file_path VARCHAR(600) NULL DEFAULT NULL AFTER generated_from_count`,
      );
    }
  }

  static fromEnv(): MySqlRepository {
    const pool = createPool({
      host: process.env.DB_HOST ?? "localhost",
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER ?? "root",
      password: process.env.DB_PASSWORD ?? "",
      database: process.env.DB_NAME ?? "classroom_companion",
      connectionLimit: 8,
    });
    return new MySqlRepository(pool);
  }

  private mapUser(row: RowDataPacket): User {
    return {
      id: row.id,
      name: row.name,
      username: row.username,
      passwordHash: row.password_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapItem(row: ItemRow): Item {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      name: row.name,
      directoryPath: row.directory_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      noteSourceType: row.type === "note" ? row.note_source_type ?? undefined : undefined,
    };
  }

  private mapNote(row: NoteRow): Note {
    return {
      itemId: row.item_id,
      rawText: row.raw_text,
      aiSummary: row.ai_summary,
      language: row.language,
      durationSeconds: row.duration_seconds,
      sourceType: row.source_type,
      generatedFromCount: row.generated_from_count,
      pdfFilePath: row.pdf_file_path ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createUser(input: { name: string; username: string; passwordHash: string }): Promise<User> {
    const [result] = await this.pool.execute(
      "INSERT INTO users (name, username, password_hash) VALUES (?, ?, ?)",
      [input.name, input.username, input.passwordHash],
    );
    const id = (result as { insertId: number }).insertId;
    const user = await this.findUserById(id);
    if (!user) throw new Error("Failed to create user");
    const full = await this.findUserByUsername(user.username);
    if (!full) throw new Error("Failed to load created user");
    return full;
  }

  async findUserByUsername(username: string): Promise<User | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM users WHERE username = ? LIMIT 1", [username]);
    if (rows.length === 0) return null;
    return this.mapUser(rows[0]);
  }

  async findUserById(id: number): Promise<AuthUser | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id, name, username FROM users WHERE id = ? LIMIT 1",
      [id],
    );
    if (rows.length === 0) return null;
    return { id: rows[0].id, name: rows[0].name, username: rows[0].username };
  }

  async listItems(params: ListItemsParams): Promise<Item[]> {
    const sortByMap: Record<SortBy, string> = {
      name: "i.name",
      creationDate: "i.created_at",
      lastEditedDate: "i.updated_at",
    };
    const sortBy = sortByMap[params.sortBy ?? "lastEditedDate"];
    const sortDir: SortDir = params.sortDir ?? "desc";
    const query = params.query ? `%${params.query}%` : null;
    const dir = normalizePath(params.directoryPath);
    const tree = params.tree ?? false;
    const pathSql = tree
      ? "(i.directory_path = ? OR i.directory_path LIKE ?)"
      : "i.directory_path = ?";
    const pathParams = tree ? [dir, `${dir}%`] : [dir];
    const sql = `
      SELECT
        i.id,
        i.user_id,
        i.type,
        i.name,
        i.directory_path,
        i.created_at,
        i.updated_at,
        n.source_type AS note_source_type
      FROM items i
      LEFT JOIN notes n ON i.type = 'note' AND n.item_id = i.id
      WHERE i.user_id = ? AND ${pathSql} AND (? IS NULL OR i.name LIKE ?)
      ORDER BY ${sortBy} ${sortDir === "asc" ? "ASC" : "DESC"}
    `;
    const [rows] = await this.pool.execute<ItemRow[]>(sql, [
      params.userId,
      ...pathParams,
      query,
      query,
    ]);
    return rows.map((r) => this.mapItem(r));
  }

  async createFolder(input: { userId: number; name: string; directoryPath: string }): Promise<Item> {
    const dir = normalizePath(input.directoryPath);
    if (!isDirectoryUnderUserRoot(dir, input.userId)) {
      throw new HttpClientError("Invalid directory for folder.", 400);
    }
    if (isFolderCreationBlockedInDirectory(dir, input.userId)) {
      throw new HttpClientError("Cannot create a folder inside the innermost folder.", 400);
    }
    const [result] = await this.pool.execute(
      "INSERT INTO items (user_id, type, name, directory_path) VALUES (?, 'folder', ?, ?)",
      [input.userId, input.name, dir],
    );
    const id = (result as { insertId: number }).insertId;
    const [rows] = await this.pool.execute<ItemRow[]>("SELECT * FROM items WHERE id = ?", [id]);
    return this.mapItem(rows[0]);
  }

  async moveItem(input: { userId: number; itemId: number; targetDirectoryPath: string }): Promise<Item | null> {
    const [targetRows] = await this.pool.execute<ItemRow[]>(
      "SELECT * FROM items WHERE id = ? AND user_id = ? LIMIT 1",
      [input.itemId, input.userId],
    );
    if (targetRows.length === 0) return null;
    const row = targetRows[0];
    const item = this.mapItem(row);

    const [allRows] = await this.pool.execute<ItemRow[]>("SELECT * FROM items WHERE user_id = ?", [input.userId]);
    const allItems = allRows.map((r) => this.mapItem(r));

    const decision = validateMoveItemContext(input.userId, item, input.targetDirectoryPath, allItems);
    if (decision.kind === "noop") return item;

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      if (decision.kind === "note") {
        await connection.execute(
          "UPDATE items SET directory_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
          [decision.target, input.itemId, input.userId],
        );
      } else {
        const { oldPrefix, newPrefix, target } = decision;
        await connection.execute(
          `UPDATE items SET
            directory_path = CONCAT(?, SUBSTRING(directory_path, CHAR_LENGTH(?) + 1)),
            updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ? AND id != ? AND directory_path LIKE CONCAT(?, '%')`,
          [newPrefix, oldPrefix, input.userId, input.itemId, oldPrefix],
        );
        await connection.execute(
          "UPDATE items SET directory_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
          [target, input.itemId, input.userId],
        );
      }
      await connection.commit();
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }

    const [after] = await this.pool.execute<ItemRow[]>("SELECT * FROM items WHERE id = ?", [input.itemId]);
    if (after.length === 0) return null;
    return this.mapItem(after[0]);
  }

  async renameItem(input: { userId: number; itemId: number; newName: string }): Promise<Item | null> {
    const [targetRows] = await this.pool.execute<ItemRow[]>(
      "SELECT * FROM items WHERE id = ? AND user_id = ? LIMIT 1",
      [input.itemId, input.userId],
    );
    if (targetRows.length === 0) return null;
    const row = targetRows[0];

    if (row.type === "folder") {
      const oldPrefix = `${normalizePath(row.directory_path)}${row.name}/`;
      const newPrefix = `${normalizePath(row.directory_path)}${input.newName}/`;
      if (oldPrefix !== newPrefix) {
        await this.pool.execute(
          `UPDATE items SET
            directory_path = CONCAT(?, SUBSTRING(directory_path, CHAR_LENGTH(?) + 1)),
            updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ? AND id != ? AND directory_path LIKE CONCAT(?, '%')`,
          [newPrefix, oldPrefix, input.userId, input.itemId, oldPrefix],
        );
      }
    }

    const [updateResult] = await this.pool.execute(
      "UPDATE items SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
      [input.newName, input.itemId, input.userId],
    );
    const changed = (updateResult as { affectedRows: number }).affectedRows;
    if (!changed) return null;
    const [rows] = await this.pool.execute<ItemRow[]>("SELECT * FROM items WHERE id = ?", [input.itemId]);
    return this.mapItem(rows[0]);
  }

  async deleteItems(input: { userId: number; itemIds: number[] }): Promise<number> {
    if (input.itemIds.length === 0) return 0;
    const placeholders = input.itemIds.map(() => "?").join(",");
    const [targetRows] = await this.pool.execute<ItemRow[]>(
      `SELECT * FROM items WHERE user_id = ? AND id IN (${placeholders})`,
      [input.userId, ...input.itemIds],
    );
    const idsToDelete = new Set<number>(targetRows.map((r) => r.id));
    const folderPrefixes = targetRows
      .filter((row) => row.type === "folder")
      .map((row) => `${normalizePath(row.directory_path)}${row.name}/`);
    if (folderPrefixes.length > 0) {
      const [descendants] = await this.pool.execute<ItemRow[]>("SELECT * FROM items WHERE user_id = ?", [input.userId]);
      descendants.forEach((row) => {
        if (folderPrefixes.some((prefix) => normalizePath(row.directory_path).startsWith(prefix))) idsToDelete.add(row.id);
      });
    }
    if (idsToDelete.size === 0) return 0;
    const idList = [...idsToDelete];
    const deleteMarks = idList.map(() => "?").join(",");

    const [pdfRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT n.pdf_file_path FROM notes n
       INNER JOIN items i ON i.id = n.item_id
       WHERE i.user_id = ? AND i.id IN (${deleteMarks}) AND n.pdf_file_path IS NOT NULL`,
      [input.userId, ...idList],
    );
    const uploadRoot = getPdfUploadRoot();
    for (const row of pdfRows) {
      const rel = typeof row.pdf_file_path === "string" ? row.pdf_file_path : "";
      if (!rel || rel.includes("..") || path.isAbsolute(rel)) continue;
      const full = path.join(uploadRoot, rel);
      if (!full.startsWith(path.resolve(uploadRoot))) continue;
      try {
        await fs.unlink(full);
      } catch {
        /* missing file is fine */
      }
    }

    await this.pool.execute(`DELETE FROM items WHERE user_id = ? AND id IN (${deleteMarks})`, [input.userId, ...idList]);
    return idsToDelete.size;
  }

  async createNote(input: CreateNoteInput): Promise<{ item: Item; note: Note }> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [itemResult] = await connection.execute(
        "INSERT INTO items (user_id, type, name, directory_path) VALUES (?, 'note', ?, ?)",
        [input.userId, input.title, normalizePath(input.directoryPath)],
      );
      const itemId = (itemResult as { insertId: number }).insertId;
      await connection.execute(
        `INSERT INTO notes (item_id, raw_text, ai_summary, language, duration_seconds, source_type, generated_from_count, pdf_file_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId,
          input.rawText,
          input.aiSummary ?? null,
          input.language,
          input.durationSeconds,
          input.sourceType ?? "recording",
          input.generatedFromCount ?? null,
          input.pdfFilePath ?? null,
        ],
      );
      await connection.commit();
      const found = await this.getNoteById({ userId: input.userId, itemId });
      if (!found) throw new Error("Failed to load created note");
      return found;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getNoteById(input: { userId: number; itemId: number }): Promise<{ item: Item; note: Note } | null> {
    const [rows] = await this.pool.execute<(ItemRow & NoteRow)[]>(
      `SELECT i.id, i.user_id, i.type, i.name, i.directory_path, i.created_at, i.updated_at,
              n.item_id, n.raw_text, n.ai_summary, n.language, n.duration_seconds, n.source_type, n.generated_from_count, n.pdf_file_path, n.created_at, n.updated_at
       FROM items i
       INNER JOIN notes n ON n.item_id = i.id
       WHERE i.user_id = ? AND i.id = ? AND i.type = 'note'
       LIMIT 1`,
      [input.userId, input.itemId],
    );
    if (rows.length === 0) return null;
    return { item: this.mapItem(rows[0]), note: this.mapNote(rows[0]) };
  }

  async listNotes(input: { userId: number; directoryPath?: string }): Promise<Array<{ item: Item; note: Note }>> {
    const [rows] = await this.pool.execute<(ItemRow & NoteRow)[]>(
      `SELECT i.id, i.user_id, i.type, i.name, i.directory_path, i.created_at, i.updated_at,
              n.item_id, n.raw_text, n.ai_summary, n.language, n.duration_seconds, n.source_type, n.generated_from_count, n.pdf_file_path, n.created_at, n.updated_at
       FROM items i
       INNER JOIN notes n ON n.item_id = i.id
       WHERE i.user_id = ? AND i.type = 'note' AND (? IS NULL OR i.directory_path = ?)
       ORDER BY i.updated_at DESC`,
      [input.userId, input.directoryPath ? normalizePath(input.directoryPath) : null, input.directoryPath ? normalizePath(input.directoryPath) : null],
    );
    return rows.map((row) => ({ item: this.mapItem(row), note: this.mapNote(row) }));
  }

  async updateNoteSummary(input: { userId: number; itemId: number; summary: string }): Promise<{ item: Item; note: Note } | null> {
    const [updateResult] = await this.pool.execute(
      `UPDATE notes n
       INNER JOIN items i ON i.id = n.item_id
       SET n.ai_summary = ?, n.updated_at = CURRENT_TIMESTAMP, i.updated_at = CURRENT_TIMESTAMP
       WHERE i.id = ? AND i.user_id = ?`,
      [input.summary, input.itemId, input.userId],
    );
    if ((updateResult as { affectedRows: number }).affectedRows === 0) return null;
    return this.getNoteById({ userId: input.userId, itemId: input.itemId });
  }

  async collectSummarySources(input: { userId: number; noteIds: number[]; folderIds: number[] }) {
    const texts: string[] = [];
    const selected = new Set<number>(input.noteIds);
    if (input.folderIds.length > 0) {
      const marks = input.folderIds.map(() => "?").join(",");
      const [folders] = await this.pool.execute<ItemRow[]>(
        `SELECT * FROM items WHERE user_id = ? AND type = 'folder' AND id IN (${marks})`,
        [input.userId, ...input.folderIds],
      );
      if (folders.length > 0) {
        const [allNotes] = await this.pool.execute<ItemRow[]>(
          "SELECT * FROM items WHERE user_id = ? AND type = 'note'",
          [input.userId],
        );
        const prefixes = folders.map((f) => `${normalizePath(f.directory_path)}${f.name}/`);
        allNotes.forEach((note) => {
          if (prefixes.some((prefix) => normalizePath(note.directory_path).startsWith(prefix))) selected.add(note.id);
        });
      }
    }
    if (selected.size === 0) return { texts: [], sourceCount: 0, summarizeLanguage: null };
    const ids = [...selected];
    const marks = ids.map(() => "?").join(",");
    const [rows] = await this.pool.execute<NoteRow[]>(
      `SELECT raw_text, language, source_type FROM notes WHERE item_id IN (${marks}) ORDER BY FIELD(item_id, ${marks})`,
      [...ids, ...ids],
    );
    const nonempty = rows.filter((r) => typeof r.raw_text === "string" && r.raw_text.trim().length > 0);
    nonempty.forEach((row) => texts.push(row.raw_text));
    const summarizeLanguage = inferSelectionSummaryLanguage(
      nonempty.map((r) => ({
        language: (r.language ?? "English").trim() || "English",
        sourceType: r.source_type,
      })),
    );
    return { texts, sourceCount: texts.length, summarizeLanguage };
  }
}
