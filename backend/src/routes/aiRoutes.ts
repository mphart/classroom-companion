import { Router } from "express";
import { z } from "zod";
import {
  generatePracticeExamFromSources,
  gradeShortAnswers,
  parseExamDocument,
} from "../lib/practiceExam";
import { summarizeSourceTexts } from "../lib/summary";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import type { Repository } from "../repositories/repository";
import { mapNoteResponse } from "./noteRoutes";

const selectionSchema = z.object({
  noteIds: z.array(z.number().int().positive()).default([]),
  folderIds: z.array(z.number().int().positive()).default([]),
  outputDirectory: z.string().trim().min(1),
  title: z.string().trim().min(1).max(180).default("Generated Summary"),
});

const practiceExamGenerateSchema = z
  .object({
    noteIds: z.array(z.number().int().positive()).default([]),
    folderIds: z.array(z.number().int().positive()).default([]),
    outputDirectory: z.string().trim().min(1),
    title: z.string().trim().min(1).max(180),
    questionCount: z.number().int().min(1).max(30),
    includeMultipleChoice: z.boolean(),
    includeShortAnswer: z.boolean(),
    otherInstructions: z.string().trim().max(2000).optional(),
  })
  .refine((b) => b.includeMultipleChoice || b.includeShortAnswer, {
    message: "Select at least one question type.",
  });

const practiceExamGradeSchema = z.object({
  noteId: z.number().int().positive(),
  responses: z.array(
    z.object({
      questionIndex: z.number().int().min(0),
      answer: z.string(),
    }),
  ),
});

export const createAiRoutes = (repo: Repository): Router => {
  const router = Router();
  router.use(requireAuth);

  router.post("/summarize/note/:noteId", async (req: AuthenticatedRequest, res, next) => {
    try {
      const noteId = z.coerce.number().int().positive().parse(req.params.noteId);
      const found = await repo.getNoteById({ userId: req.authUserId!, itemId: noteId });
      if (!found) return res.status(404).json({ error: "Note not found." });
      const summary = await summarizeSourceTexts([found.note.rawText]);
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
      const summary = await summarizeSourceTexts(texts);
      const created = await repo.createNote({
        userId: req.authUserId!,
        title: body.title,
        directoryPath: body.outputDirectory,
        rawText: summary,
        aiSummary: summary,
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

  router.post("/practice-exam/generate", async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = practiceExamGenerateSchema.parse(req.body);
      const { texts, sourceCount } = await repo.collectSummarySources({
        userId: req.authUserId!,
        noteIds: body.noteIds,
        folderIds: body.folderIds,
      });
      if (texts.length === 0) return res.status(400).json({ error: "No source notes found for selected inputs." });

      const exam = await generatePracticeExamFromSources({
        texts,
        title: body.title,
        questionCount: body.questionCount,
        includeMultipleChoice: body.includeMultipleChoice,
        includeShortAnswer: body.includeShortAnswer,
        otherInstructions: body.otherInstructions,
      });

      const created = await repo.createNote({
        userId: req.authUserId!,
        title: body.title,
        directoryPath: body.outputDirectory,
        rawText: JSON.stringify(exam),
        language: "English",
        durationSeconds: 0,
        sourceType: "generated_practice_exam",
        generatedFromCount: sourceCount,
      });
      return res.status(201).json({ note: mapNoteResponse(created)!, sourceCount });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/practice-exam/grade", async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = practiceExamGradeSchema.parse(req.body);
      const found = await repo.getNoteById({ userId: req.authUserId!, itemId: body.noteId });
      if (!found) return res.status(404).json({ error: "Note not found." });
      if (found.note.sourceType !== "generated_practice_exam") {
        return res.status(400).json({ error: "This note is not a practice exam." });
      }
      const exam = parseExamDocument(found.note.rawText);
      for (const r of body.responses) {
        const q = exam.questions[r.questionIndex];
        if (!q || q.type !== "short_answer") {
          return res.status(400).json({ error: "Invalid short-answer question index." });
        }
      }
      if (body.responses.length === 0) {
        return res.json({ results: [] });
      }
      const results = await gradeShortAnswers({ exam, responses: body.responses });
      return res.json({ results });
    } catch (error) {
      return next(error);
    }
  });

  return router;
};
