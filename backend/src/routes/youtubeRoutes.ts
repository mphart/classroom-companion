import { Router } from 'express';
import { z } from 'zod';
import { HttpClientError } from '../lib/errors';
import { courseFolderLabelFromSaveDirectory } from '../lib/courseFolderLabel';
import { buildLectureNoteRawText } from '../lib/lectureNoteRawText';
import { normalizeDirectoryPath, isDirectoryUnderUserRoot } from '../lib/itemPathDepth';
import { parseYoutubePipeline } from '../lib/youtubeAudioParse';
import { createRequireAuth, type AuthenticatedRequest } from '../middleware/auth';
import type { Repository } from '../repositories/repository';
import { mapNoteResponse } from './noteRoutes';

const parseBodySchema = z.object({
  youtubeUrl: z.string().trim().min(1).max(500),
  directory: z.string().trim().min(1).max(500),
  language: z.string().trim().min(1).max(80).optional().default('English'),
  title: z.string().trim().min(1).max(160).optional(),
});

export function isLikelyYoutubeVideoUrl(raw: string): boolean {
  try {
    const trimmed = raw.trim();
    const withScheme = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    const u = new URL(withScheme);
    const h = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (h === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0] ?? '';
      return Boolean(id && /^[\w-]{6,}$/.test(id));
    }
    if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'music.youtube.com') {
      if (u.pathname === '/watch') {
        const v = u.searchParams.get('v');
        return Boolean(v && /^[\w-]{6,}$/.test(v));
      }
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.slice('/shorts/'.length).split('/')[0] ?? '';
        return Boolean(id && /^[\w-]{6,}$/.test(id));
      }
    }
    return false;
  } catch {
    return false;
  }
}

export const createYoutubeRoutes = (repo: Repository): Router => {
  const router = Router();
  router.use(createRequireAuth(repo));

  router.post('/parse', async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = parseBodySchema.parse(req.body);
      if (!isLikelyYoutubeVideoUrl(body.youtubeUrl)) {
        throw new HttpClientError('Please enter a valid YouTube URL.', 400);
      }
      const userId = req.authUserId!;
      const dir = normalizeDirectoryPath(body.directory);
      if (!isDirectoryUnderUserRoot(dir, userId)) {
        throw new HttpClientError('Invalid directory for note.', 400);
      }

      const parsed = await parseYoutubePipeline({
        youtubeUrl: body.youtubeUrl,
        outputLanguage: body.language,
        titleOverride: body.title,
      });

      const rawText = buildLectureNoteRawText({
        title: parsed.noteTitle,
        courseLabel: courseFolderLabelFromSaveDirectory(dir, userId),
        language: body.language,
        transcript: parsed.transcriptText,
        notesPlaceholder: '- Parsed from YouTube (no live session notes).',
      });

      const created = await repo.createNote({
        userId,
        title: parsed.noteTitle,
        directoryPath: dir,
        rawText,
        aiSummary: parsed.summaryMarkdown,
        language: body.language,
        durationSeconds: parsed.durationSeconds,
        sourceType: 'recording',
        youtubeSourceUrl: parsed.youtubeSourceUrl,
      });

      return res.status(201).json({ note: mapNoteResponse(created)! });
    } catch (error) {
      return next(error);
    }
  });

  return router;
};
