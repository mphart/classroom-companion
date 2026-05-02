import { Router } from "express";
import { z } from "zod";
import { generateSummary } from "../lib/summary";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import type { Repository } from "../repositories/repository";
import { mapNoteResponse } from "./noteRoutes";

const selectionSchema = z.object({
  noteIds: z.array(z.number().int().positive()).default([]),
  folderIds: z.array(z.number().int().positive()).default([]),
  outputDirectory: z.string().trim().min(1),
  title: z.string().trim().min(1).max(180).default("Generated Summary"),
});

export const createAiRoutes = (repo: Repository): Router => {
  const router = Router();
  router.use(requireAuth);

  router.post("/summarize/note/:noteId", async (req: AuthenticatedRequest, res, next) => {
    try {
      const noteId = z.coerce.number().int().positive().parse(req.params.noteId);
      const found = await repo.getNoteById({ userId: req.authUserId!, itemId: noteId });
      if (!found) return res.status(404).json({ error: "Note not found." });
      const summary = generateSummary([found.note.rawText]);
      const updated = await repo.updateNoteSummary({ userId: req.authUserId!, itemId: noteId, summary });
      return res.json({ note: mapNoteResponse(updated) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/summarize/selection", async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = selectionSchema.parse(req.body);
      const { texts, sourceCount } = await repo.collectSummarySources({
        userId: req.authUserId!,
        noteIds: body.noteIds,
        folderIds: body.folderIds,
      });
      if (texts.length === 0) return res.status(400).json({ error: "No source notes found for selected inputs." });
      const summary = generateSummary(texts);
      const created = await repo.createNote({
        userId: req.authUserId!,
        title: body.title,
        directoryPath: body.outputDirectory,
        rawText: summary,
        language: "English",
        durationSeconds: 0,
        sourceType: "generated_summary",
        generatedFromCount: sourceCount,
      });
      return res.status(201).json({ note: mapNoteResponse(created), sourceCount });
    } catch (error) {
      return next(error);
    }
  });

  return router;
};
