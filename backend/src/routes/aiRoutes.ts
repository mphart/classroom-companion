import { Router } from "express";
import { z } from "zod";
import {
  generatePracticeExamFromSources,
  gradeShortAnswers,
  parseExamDocument,
} from "../lib/practiceExam";
import { answerSessionQuestion } from "../lib/sessionQa";
import { inferSelectionSummaryLanguage } from "../lib/inferSelectionSummaryLanguage";
import { summarizeSourceTexts } from "../lib/summary";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import type { Repository } from "../repositories/repository";
import { mapNoteResponse } from "./noteRoutes";

const selectionSchema = z.object({
  noteIds: z.array(z.number().int().positive()).default([]),
  folderIds: z.array(z.number().int().positive()).default([]),
  outputDirectory: z.string().trim().min(1),
  title: z.string().trim().min(1).max(180).default("Generated Summary"),
  outputLanguage: z.string().trim().min(1).max(80).optional(),
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
    outputLanguage: z.string().trim().min(1).max(80).optional(),
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

const sessionQaSchema = z.object({
  transcript: z.string().max(120_000),
  question: z.string().trim().min(1).max(1500),
  language: z.string().trim().max(80).optional(),
});

/** Per-user cooldown between Session Q&A requests (ms). */
const SESSION_QA_COOLDOWN_MS = 12_000;
const sessionQaLastRequestAt = new Map<number, number>();

export const createAiRoutes = (repo: Repository): Router => {
  const router = Router();
  router.use(requireAuth);

  router.post("/summarize/note/:noteId", async (req: AuthenticatedRequest, res, next) => {
    try {
      const noteId = z.coerce.number().int().positive().parse(req.params.noteId);
      const found = await repo.getNoteById({ userId: req.authUserId!, itemId: noteId });
      if (!found) return res.status(404).json({ error: "Note not found." });
      const inferred = inferSelectionSummaryLanguage([
        { language: found.note.language, sourceType: found.note.sourceType },
      ]);
      const summary = await summarizeSourceTexts([found.note.rawText], {
        outputLanguage: inferred ?? undefined,
      });
      const updated = await repo.updateNoteSummary({ userId: req.authUserId!, itemId: noteId, summary });
      return res.json({ note: mapNoteResponse(updated) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/summarize/selection", async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = selectionSchema.parse(req.body);
      const { texts, sourceCount, summarizeLanguage } = await repo.collectSummarySources({
        userId: req.authUserId!,
        noteIds: body.noteIds,
        folderIds: body.folderIds,
      });
      if (texts.length === 0) return res.status(400).json({ error: "No source notes found for selected inputs." });
      const outputLanguage = body.outputLanguage ?? summarizeLanguage ?? undefined;
      const summary = await summarizeSourceTexts(texts, { outputLanguage });
      const createdLanguage = outputLanguage?.trim() || "English";
      const created = await repo.createNote({
        userId: req.authUserId!,
        title: body.title,
        directoryPath: body.outputDirectory,
        rawText: summary,
        aiSummary: summary,
        language: createdLanguage,
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
      const { texts, sourceCount, summarizeLanguage } = await repo.collectSummarySources({
        userId: req.authUserId!,
        noteIds: body.noteIds,
        folderIds: body.folderIds,
      });
      if (texts.length === 0) return res.status(400).json({ error: "No source notes found for selected inputs." });

      const outputLanguage = body.outputLanguage ?? summarizeLanguage ?? undefined;
      const exam = await generatePracticeExamFromSources({
        texts,
        title: body.title,
        questionCount: body.questionCount,
        includeMultipleChoice: body.includeMultipleChoice,
        includeShortAnswer: body.includeShortAnswer,
        otherInstructions: body.otherInstructions,
        outputLanguage,
      });

      const createdLanguage = outputLanguage?.trim() || "English";
      const created = await repo.createNote({
        userId: req.authUserId!,
        title: body.title,
        directoryPath: body.outputDirectory,
        rawText: JSON.stringify(exam),
        language: createdLanguage,
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
      const results = await gradeShortAnswers({
        exam,
        responses: body.responses,
        feedbackLanguage: found.note.language,
      });
      return res.json({ results });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/session-qa", async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = sessionQaSchema.parse(req.body);
      const uid = req.authUserId!;
      const now = Date.now();
      const last = sessionQaLastRequestAt.get(uid) ?? 0;
      if (now - last < SESSION_QA_COOLDOWN_MS) {
        const waitSec = Math.ceil((SESSION_QA_COOLDOWN_MS - (now - last)) / 1000);
        return res.status(429).json({ error: `Please wait ${waitSec}s before another question.` });
      }
      sessionQaLastRequestAt.set(uid, now);

      const answer = await answerSessionQuestion({
        transcript: body.transcript,
        question: body.question,
        language: body.language,
      });
      return res.json({ answer });
    } catch (error) {
      return next(error);
    }
  });

  return router;
};
