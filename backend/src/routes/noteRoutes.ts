import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import type { Repository } from "../repositories/repository";
import type { Item, Note } from "../types";

const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(160),
  directory: z.string().trim().min(1).max(500),
  rawText: z.string().min(1),
  language: z.string().trim().min(1).max(80).default("English"),
  durationSeconds: z.number().int().nonnegative(),
});

type NoteWithItem = { item: Item; note: Note };

export const mapNoteResponse = (record: NoteWithItem | null) => {
  if (!record) return null;
  return {
    id: record.item.id,
    title: record.item.name,
    directory: record.item.directoryPath,
    createdDate: record.item.createdAt.toISOString(),
    lastEditedDate: record.item.updatedAt.toISOString(),
    rawText: record.note.rawText,
    aiSummary: record.note.aiSummary,
    language: record.note.language,
    durationSeconds: record.note.durationSeconds,
    sourceType: record.note.sourceType,
    generatedFromCount: record.note.generatedFromCount,
  };
};

export const createNoteRoutes = (repo: Repository): Router => {
  const router = Router();
  router.use(requireAuth);

  router.post("/", async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = createNoteSchema.parse(req.body);
      const created = await repo.createNote({
        userId: req.authUserId!,
        title: body.title,
        directoryPath: body.directory,
        rawText: body.rawText,
        language: body.language,
        durationSeconds: body.durationSeconds,
        sourceType: "recording",
      });
      return res.status(201).json({ note: mapNoteResponse(created)! });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:noteId", async (req: AuthenticatedRequest, res, next) => {
    try {
      const noteId = z.coerce.number().int().positive().parse(req.params.noteId);
      const found = await repo.getNoteById({ userId: req.authUserId!, itemId: noteId });
      if (!found) return res.status(404).json({ error: "Note not found." });
      return res.json({ note: mapNoteResponse(found)! });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/", async (req: AuthenticatedRequest, res, next) => {
    try {
      const directory = req.query.directory ? z.string().parse(req.query.directory) : undefined;
      const notes = await repo.listNotes({ userId: req.authUserId!, directoryPath: directory });
      return res.json({ notes: notes.map((note) => mapNoteResponse(note)) });
    } catch (error) {
      return next(error);
    }
  });

  return router;
};
