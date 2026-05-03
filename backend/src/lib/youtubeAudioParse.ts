import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AssemblyAI } from 'assemblyai';
import { HttpClientError, SummarizerError } from './errors';
import { summarizeSourceTexts } from './summary';

export const YOUTUBE_ACCESS_ERROR = 'Could not access the video. Make sure the link is public and try again.';
export const TRANSCRIPTION_ERROR = 'Transcription failed. Please try again.';

/** AssemblyAI requires explicit models on `/v2/transcript` (no default). Order = priority with fallback. */
const ASSEMBLYAI_SPEECH_MODELS = ['universal-3-pro', 'universal-2'] as const;

const LOG_PREFIX = '[youtube/parse]';

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…(truncated,len=${String(s.length)})`;
}

/** Safe, JSON-serializable detail for logs (no circular refs). */
export function unknownErrorDetail(err: unknown): Record<string, unknown> {
  if (err instanceof HttpClientError) {
    return {
      kind: 'HttpClientError',
      message: err.message,
      statusCode: err.statusCode,
      ...(err.details ? { details: err.details } : {}),
    };
  }
  if (err instanceof SummarizerError) {
    return {
      kind: 'SummarizerError',
      message: err.message,
      statusCode: err.statusCode,
      ...(err.details ? { details: err.details } : {}),
    };
  }
  if (err instanceof Error) {
    const o: Record<string, unknown> = {
      kind: err.name,
      message: err.message,
      stack: err.stack ? truncate(err.stack, 4000) : undefined,
    };
    const any = err as Error & {
      status?: number;
      statusCode?: number;
      code?: string;
      body?: unknown;
      response?: { status?: number; data?: unknown };
      cause?: unknown;
    };
    if (typeof any.status === 'number') o.httpStatus = any.status;
    if (typeof any.statusCode === 'number') o.httpStatusCode = any.statusCode;
    if (typeof any.code === 'string') o.code = any.code;
    if (any.response?.status !== undefined) o.responseStatus = any.response.status;
    if (any.response?.data !== undefined) {
      try {
        const d = any.response.data;
        o.responseData =
          typeof d === 'string' ? truncate(d, 2000) : JSON.parse(JSON.stringify(d)) as unknown;
      } catch {
        o.responseData = truncate(String(any.response.data), 2000);
      }
    }
    if (any.body !== undefined) {
      try {
        o.body =
          typeof any.body === 'string'
            ? truncate(any.body, 2000)
            : (JSON.parse(JSON.stringify(any.body)) as unknown);
      } catch {
        o.body = truncate(String(any.body), 2000);
      }
    }
    if (any.cause !== undefined) o.cause = unknownErrorDetail(any.cause);
    return o;
  }
  if (err && typeof err === 'object') {
    try {
      return { kind: 'object', data: JSON.parse(JSON.stringify(err)) as unknown };
    } catch {
      return { kind: 'object', stringified: truncate(String(err), 2000) };
    }
  }
  return { kind: 'primitive', value: String(err) };
}

function youtubeParseLog(stage: string, data: Record<string, unknown>): void {
  const line = JSON.stringify({ stage, at: new Date().toISOString(), ...data });
  // eslint-disable-next-line no-console
  console.error(LOG_PREFIX, line);
}

function transcriptErrorFields(transcript: Record<string, unknown>): Record<string, unknown> {
  const pick = ['id', 'status', 'error', 'language_code', 'audio_duration', 'confidence'];
  const out: Record<string, unknown> = {};
  for (const k of pick) {
    if (k in transcript && transcript[k] !== undefined) out[k] = transcript[k];
  }
  return out;
}

/** Best-effort human reason from AssemblyAI transcript `error` (string or nested object). */
function assemblyTranscriptUserReason(tr: Record<string, unknown>): string | undefined {
  const err = tr.error;
  if (typeof err === 'string' && err.trim()) return truncate(err.trim(), 500);
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    if (typeof o.error === 'string' && o.error.trim()) return truncate(o.error.trim(), 500);
    if (typeof o.message === 'string' && o.message.trim()) return truncate(o.message.trim(), 500);
  }
  return undefined;
}

function ytDlpBin(): string {
  return process.env.YT_DLP_BIN?.trim() || 'yt-dlp';
}

function normalizeYoutubeInput(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith('http://') && !t.startsWith('https://')) return `https://${t}`;
  return t;
}

export function canonicalYoutubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function spawnComplete(
  cmd: string,
  args: string[],
  opts: { cwd?: string },
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout?.on('data', (d: Buffer) => out.push(d));
    child.stderr?.on('data', (d: Buffer) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        exitCode: code,
      });
    });
  });
}

async function ytDlpDumpJson(url: string): Promise<{ id: string; title?: string; duration?: number }> {
  const bin = ytDlpBin();
  const args = ['--dump-json', '--skip-download', '--no-playlist', '--no-warnings', url];
  try {
    const { stdout, stderr, exitCode } = await spawnComplete(bin, args, {});
    if (exitCode !== 0) {
      const stderrTail = truncate(stderr.trim(), 3500);
      youtubeParseLog('yt-dlp-dump-json-nonzero', {
        exitCode,
        bin,
        stderrTail,
        stdoutHead: truncate(stdout.trim(), 500),
      });
      throw new HttpClientError(YOUTUBE_ACCESS_ERROR, 502, {
        stage: 'yt-dlp-dump-json-nonzero',
        exitCode,
        stderrTail: truncate(stderr.trim(), 1500),
      });
    }
    let info: { id?: string; title?: string; duration?: number };
    try {
      info = JSON.parse(stdout.trim()) as { id?: string; title?: string; duration?: number };
    } catch (parseErr) {
      youtubeParseLog('yt-dlp-dump-json-parse', {
        error: unknownErrorDetail(parseErr),
        stdoutHead: truncate(stdout.trim(), 1500),
        stderrTail: truncate(stderr.trim(), 1500),
      });
      throw new HttpClientError(YOUTUBE_ACCESS_ERROR, 502, {
        stage: 'yt-dlp-dump-json-parse',
        stdoutHead: truncate(stdout.trim(), 800),
        stderrTail: truncate(stderr.trim(), 1200),
      });
    }
    if (!info.id || typeof info.id !== 'string') {
      youtubeParseLog('yt-dlp-dump-json-missing-id', {
        stdoutHead: truncate(stdout.trim(), 1500),
      });
      throw new HttpClientError(YOUTUBE_ACCESS_ERROR, 502, {
        stage: 'yt-dlp-dump-json-missing-id',
        stdoutHead: truncate(stdout.trim(), 800),
      });
    }
    return { id: info.id, title: info.title, duration: info.duration };
  } catch (e) {
    if (e instanceof HttpClientError) throw e;
    youtubeParseLog('yt-dlp-dump-json-exception', { error: unknownErrorDetail(e) });
    throw new HttpClientError(YOUTUBE_ACCESS_ERROR, 502, {
      stage: 'yt-dlp-dump-json-exception',
      error: unknownErrorDetail(e),
    });
  }
}

async function ytDlpDownloadBestAudio(url: string, cwd: string, videoId: string): Promise<void> {
  const bin = ytDlpBin();
  const args = ['-f', 'bestaudio/best', '-o', `${videoId}.%(ext)s`, '--no-playlist', '--no-warnings', url];
  try {
    const { stderr, stdout, exitCode } = await spawnComplete(bin, args, { cwd });
    if (exitCode !== 0) {
      youtubeParseLog('yt-dlp-download-nonzero', {
        exitCode,
        videoId,
        bin,
        cwd,
        stderrTail: truncate(stderr.trim(), 3500),
        stdoutTail: truncate(stdout.trim(), 800),
      });
      throw new HttpClientError(YOUTUBE_ACCESS_ERROR, 502, {
        stage: 'yt-dlp-download-nonzero',
        exitCode,
        videoId,
        stderrTail: truncate(stderr.trim(), 1500),
        stdoutTail: truncate(stdout.trim(), 600),
      });
    }
  } catch (e) {
    if (e instanceof HttpClientError) throw e;
    const code = e && typeof e === 'object' && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined;
    youtubeParseLog('yt-dlp-download-exception', {
      videoId,
      spawnErrno: code,
      error: unknownErrorDetail(e),
    });
    if (code === 'ENOENT') {
      throw new HttpClientError(YOUTUBE_ACCESS_ERROR, 502, {
        stage: 'yt-dlp-download-enoent',
        videoId,
        hint: 'yt-dlp may be missing from PATH',
      });
    }
    throw new HttpClientError(YOUTUBE_ACCESS_ERROR, 502, {
      stage: 'yt-dlp-download-exception',
      videoId,
      spawnErrno: code,
      error: unknownErrorDetail(e),
    });
  }
}

async function resolveDownloadedAudioPath(cwd: string, videoId: string): Promise<string> {
  const names = await fs.readdir(cwd);
  const exact = names.find((n) => n.startsWith(`${videoId}.`) && !n.endsWith('.part'));
  if (exact) return path.join(cwd, exact);
  const media = names.filter(
    (n) => /\.(m4a|webm|opus|mp3|wav|ogg|aac|mkv|mp4)$/i.test(n) && !n.endsWith('.part'),
  );
  if (media.length === 1) return path.join(cwd, media[0]!);
  youtubeParseLog('yt-dlp-output-not-found', {
    videoId,
    cwd,
    entries: names,
    mediaCandidates: media,
  });
  throw new HttpClientError(YOUTUBE_ACCESS_ERROR, 502, {
    stage: 'yt-dlp-output-not-found',
    videoId,
    entries: names.slice(0, 40),
    mediaCandidates: media,
  });
}

async function transcribeWithAssemblyAi(filePath: string): Promise<string> {
  const key = process.env.ASSEMBLYAI_API_KEY?.trim();
  if (!key) {
    youtubeParseLog('assemblyai-missing-api-key', {});
    throw new HttpClientError('Transcription is not configured. Set ASSEMBLYAI_API_KEY.', 503, {
      stage: 'assemblyai-missing-api-key',
    });
  }
  const client = new AssemblyAI({ apiKey: key });
  let stat: { size?: number };
  try {
    stat = await fs.stat(filePath);
  } catch (statErr) {
    youtubeParseLog('assemblyai-audio-stat-failed', {
      filePath: path.basename(filePath),
      error: unknownErrorDetail(statErr),
    });
    throw new HttpClientError(TRANSCRIPTION_ERROR, 502, {
      stage: 'assemblyai-audio-stat-failed',
      file: path.basename(filePath),
      error: unknownErrorDetail(statErr),
    });
  }

  try {
    const transcript = await client.transcripts.transcribe({
      audio: filePath,
      speech_models: [...ASSEMBLYAI_SPEECH_MODELS],
    });
    const tr = transcript as unknown as Record<string, unknown>;

    if (transcript.status === 'error') {
      youtubeParseLog('assemblyai-transcript-status-error', {
        filePath: path.basename(filePath),
        audioBytes: stat.size,
        transcript: transcriptErrorFields(tr),
      });
      const reason = assemblyTranscriptUserReason(tr);
      throw new HttpClientError(reason ?? TRANSCRIPTION_ERROR, 502, {
        stage: 'assemblyai-transcript-status-error',
        file: path.basename(filePath),
        transcript: transcriptErrorFields(tr),
      });
    }
    const text = transcript.text?.trim();
    if (!text) {
      youtubeParseLog('assemblyai-transcript-empty-text', {
        filePath: path.basename(filePath),
        audioBytes: stat.size,
        transcript: transcriptErrorFields(tr),
      });
      throw new HttpClientError(TRANSCRIPTION_ERROR, 502, {
        stage: 'assemblyai-transcript-empty-text',
        file: path.basename(filePath),
        transcript: transcriptErrorFields(tr),
      });
    }
    return text;
  } catch (e) {
    if (e instanceof HttpClientError) throw e;
    youtubeParseLog('assemblyai-transcribe-exception', {
      filePath: path.basename(filePath),
      audioBytes: stat.size,
      error: unknownErrorDetail(e),
    });
    throw new HttpClientError(TRANSCRIPTION_ERROR, 502, {
      stage: 'assemblyai-transcribe-exception',
      file: path.basename(filePath),
      error: unknownErrorDetail(e),
    });
  }
}

export type YoutubePipelineResult = {
  transcriptText: string;
  summaryMarkdown: string;
  durationSeconds: number;
  noteTitle: string;
  youtubeSourceUrl: string;
};

export async function parseYoutubePipeline(opts: {
  youtubeUrl: string;
  outputLanguage: string;
  titleOverride?: string;
}): Promise<YoutubePipelineResult> {
  const url = normalizeYoutubeInput(opts.youtubeUrl);
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-parse-'));
  try {
    const meta = await ytDlpDumpJson(url);
    await ytDlpDownloadBestAudio(url, tmpRoot, meta.id);
    const audioPath = await resolveDownloadedAudioPath(tmpRoot, meta.id);
    const transcriptText = await transcribeWithAssemblyAi(audioPath);
    let summaryMarkdown: string;
    try {
      summaryMarkdown = await summarizeSourceTexts([transcriptText], {
        outputLanguage: opts.outputLanguage,
      });
    } catch (e) {
      youtubeParseLog('gemini-summarize-after-transcript-failed', {
        videoId: meta.id,
        transcriptChars: transcriptText.length,
        error: unknownErrorDetail(e),
      });
      throw e;
    }
    const durationSeconds = Math.max(0, Math.floor(Number(meta.duration) || 0));
    const hint = opts.titleOverride?.trim();
    const fromMeta = meta.title?.trim();
    const baseTitle = hint || fromMeta || `YouTube ${meta.id}`;
    const noteTitle = baseTitle.slice(0, 160);
    const youtubeSourceUrl = canonicalYoutubeWatchUrl(meta.id);
    return {
      transcriptText,
      summaryMarkdown,
      durationSeconds,
      noteTitle,
      youtubeSourceUrl,
    };
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}
