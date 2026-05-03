import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import multer from "multer";
import { z } from "zod";
import { extractPdfTextWithSlideMarkers } from "../lib/extractPdfText";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import type { Repository } from "../repositories/repository";
import { getPdfUploadRoot } from "../lib/uploadPaths";
import type { Item, Note } from "../types";
import { isDirectoryUnderUserRoot } from "../lib/itemPathDepth";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

const uploadPdfMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES },
  fileFilter: (_req, file, cb) => {
    const okMime = file.mimetype === "application/pdf";
    const okName = file.originalname.toLowerCase().endsWith(".pdf");
    if (okMime || okName) cb(null, true);
    else cb(new Error("Only PDF uploads are allowed."));
  },
});

const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(160),
  directory: z.string().trim().min(1).max(500),
  rawText: z.string().min(1),
  language: z.string().trim().min(1).max(80).default("English"),
  durationSeconds: z.number().int().nonnegative(),
});

const uploadPdfFieldsSchema = z.object({
  directory: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(160).optional(),
});

type NoteWithItem = { item: Item; note: Note };

export const mapNoteResponse = (record: NoteWithItem | null) => {
  if (!record) return null;
  const pdfUrl =
    record.note.sourceType === "slide_pdf" && record.note.pdfFilePath
      ? `/notes/${record.item.id}/pdf`
      : undefined;
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
    ...(pdfUrl ? { pdfUrl } : {}),
  };
};

function sanitizePdfTitle(originalName: string | undefined, fallback: string): string {
  const base = (originalName ?? "").replace(/\\/g, "/").split("/").pop() ?? "";
  const withoutExt = base.replace(/\.pdf$/i, "").trim();
  const candidate = withoutExt.length > 0 ? withoutExt : fallback;
  return candidate.slice(0, 160);
}

export const createNoteRoutes = (repo: Repository): Router => {
  const router = Router();
  router.use(requireAuth);

  router.post(
    "/upload-pdf",
    (req: AuthenticatedRequest, res, next) => {
      uploadPdfMulter.single("file")(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: "PDF must be at most 25 MB." });
          }
          return res.status(400).json({ error: err.message });
        }
        if (err instanceof Error) {
          return res.status(400).json({ error: err.message });
        }
        next();
      });
    },
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const body = uploadPdfFieldsSchema.parse(req.body);
        const dir = body.directory.endsWith("/") ? body.directory : `${body.directory}/`;
        if (!isDirectoryUnderUserRoot(dir, req.authUserId!)) {
          return res.status(400).json({ error: "Invalid directory." });
        }

        const file = req.file;
        if (!file?.buffer?.length) {
          return res.status(400).json({ error: "A PDF file is required (field name: file)." });
        }

        const title = sanitizePdfTitle(file.originalname, "Slides");
        const finalTitle = body.title?.trim().length ? body.title!.trim().slice(0, 160) : title;

        const { rawText } = await extractPdfTextWithSlideMarkers(file.buffer);
        const userId = req.authUserId!;
        const relativePath = `${userId}/${randomUUID()}.pdf`;
        const uploadRoot = getPdfUploadRoot();
        const absolutePath = path.join(uploadRoot, relativePath);

        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, file.buffer);

        try {
          const created = await repo.createNote({
            userId,
            title: finalTitle,
            directoryPath: dir,
            rawText,
            language: "English",
            durationSeconds: 0,
            sourceType: "slide_pdf",
            pdfFilePath: relativePath,
          });
          return res.status(201).json({ note: mapNoteResponse(created)! });
        } catch (e) {
          try {
            await fs.unlink(absolutePath);
          } catch {
            /* ignore */
          }
          throw e;
        }
      } catch (error) {
        return next(error);
      }
    },
  );

  router.get("/", async (req: AuthenticatedRequest, res, next) => {
    try {
      const directory = req.query.directory ? z.string().parse(req.query.directory) : undefined;
      const notes = await repo.listNotes({ userId: req.authUserId!, directoryPath: directory });
      return res.json({ notes: notes.map((note) => mapNoteResponse(note)) });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:noteId/pdf", async (req: AuthenticatedRequest, res, next) => {
    try {
      const noteId = z.coerce.number().int().positive().parse(req.params.noteId);
      const found = await repo.getNoteById({ userId: req.authUserId!, itemId: noteId });
      if (!found) return res.status(404).json({ error: "Note not found." });
      if (found.note.sourceType !== "slide_pdf" || !found.note.pdfFilePath) {
        return res.status(404).json({ error: "No PDF file for this note." });
      }
      const rel = found.note.pdfFilePath;
      if (rel.includes("..") || path.isAbsolute(rel)) {
        return res.status(404).json({ error: "Note not found." });
      }
      const uploadRoot = getPdfUploadRoot();
      const absolutePath = path.join(uploadRoot, rel);
      const resolvedRoot = path.resolve(uploadRoot);
      if (!absolutePath.startsWith(resolvedRoot)) {
        return res.status(404).json({ error: "Note not found." });
      }

      try {
        await fs.access(absolutePath);
      } catch {
        return res.status(404).json({ error: "PDF file is missing on the server." });
      }

      const safeName = `${found.item.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "slides"}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
      createReadStream(absolutePath).pipe(res);
    } catch (error) {
      return next(error);
    }
  });

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

  return router;
};
