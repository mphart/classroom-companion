import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import { BookOpen, FileText, Mic, Sparkles } from 'lucide-react';
import logo from '@/imports/classroomcompanion_logo_v4.svg';
import { getNote, regenerateNoteAiSummary, type NoteDto } from '@/app/lib/api';
import { MarkdownPreview } from '@/app/components/MarkdownPreview';
import { getSessionUser } from '@/app/lib/authSession';
import { firstNameFromDisplayName, timeOfDayGreeting, userInitials } from '@/app/lib/personalGreeting';
import '@/styles/brand-ambient.css';

type ViewerState = {
  noteId?: number;
} | null;

function parseNoteIdFromSearch(searchParams: URLSearchParams): number | undefined {
  const raw = searchParams.get('noteId');
  if (raw == null || raw === '') return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return n;
}

export function Viewer() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const reduceMotion = useReducedMotion();
  const sessionUser = getSessionUser();
  const viewerState = (location.state as ViewerState) ?? null;

  const stateId = viewerState?.noteId;
  const fromQuery = parseNoteIdFromSearch(searchParams);
  const noteId =
    typeof stateId === 'number' && Number.isInteger(stateId) && stateId > 0 ? stateId : fromQuery;
  const [note, setNote] = useState<NoteDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (noteId === undefined) return;
    if (!searchParams.get('noteId')) {
      navigate(`/viewer?noteId=${noteId}`, { replace: true, state: { noteId } });
    }
  }, [noteId, navigate, searchParams]);

  useEffect(() => {
    if (noteId === undefined) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const fetched = await getNote(noteId);
        if (!cancelled) setNote(fetched);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load note');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  const handleGeminiSummarize = async () => {
    if (noteId === undefined) return;
    const body = note?.rawText?.trim() ?? '';
    if (!body) return;
    setSummarizing(true);
    setError('');
    try {
      const updated = await regenerateNoteAiSummary(noteId);
      setNote(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setSummarizing(false);
    }
  };

  if (!noteId) {
    return <Navigate to="/home" replace />;
  }

  const firstName = sessionUser ? firstNameFromDisplayName(sessionUser.name) : 'there';
  const dayGreet = timeOfDayGreeting();
  const profileInitials = sessionUser ? userInitials(sessionUser.name, sessionUser.username) : '?';

  const subtitle =
    note && note.sourceType === 'generated_summary' && typeof note.generatedFromCount === 'number'
      ? `Gemini-generated • merged from ${note.generatedFromCount} source note(s)`
      : note
        ? note.sourceType === 'generated_summary'
          ? 'Gemini-generated summary note'
          : 'Saved lecture note'
        : '';

  const noteKindMeta = useMemo(() => {
    if (!note) return { label: 'Note', Icon: FileText };
    if (note.sourceType === 'generated_summary') return { label: 'AI summary', Icon: Sparkles };
    if (note.sourceType === 'recording') return { label: 'Lecture capture', Icon: Mic };
    return { label: 'Note', Icon: BookOpen };
  }, [note]);

  const { Icon: NoteKindIcon, label: noteKindLabel } = noteKindMeta;

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div
          className="brand-ambient-blob-a absolute -left-[15%] top-[-10%] h-[min(48vmin,20rem)] w-[min(48vmin,20rem)] rounded-full bg-[var(--brand)] opacity-[0.07] blur-[3.5rem]"
          style={{ animationDelay: '-2.5s' }}
        />
        <div
          className="brand-ambient-blob-c absolute right-[-8%] bottom-[15%] h-[min(42vmin,18rem)] w-[min(42vmin,18rem)] rounded-full bg-[var(--brand)] opacity-[0.06] blur-[3rem]"
          style={{ animationDelay: '-1s' }}
        />
      </div>

      <div className="relative z-10 flex w-80 shrink-0 flex-col border-r border-border bg-card/95 backdrop-blur-sm dark:bg-card/90">
        <div className="p-6">
          <div
            className="mb-4 h-1 w-full rounded-full opacity-90"
            style={{
              background: `linear-gradient(90deg, transparent, var(--brand), var(--brand-hover), transparent)`,
            }}
            aria-hidden
          />
          <div className="mb-5 flex items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-semibold text-white shadow-md ring-1 ring-black/5 dark:ring-white/10"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              {profileInitials}
            </div>
            <div className="min-w-0">
              <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">{dayGreet}</p>
              <p className="text-sm font-medium text-foreground">Reading as {firstName}</p>
              {sessionUser ? (
                <p className="truncate text-xs text-muted-foreground">@{sessionUser.username}</p>
              ) : null}
            </div>
          </div>

          <div className="mb-6">
            <h2 className="mb-1 text-lg leading-snug">{note?.title ?? (loading ? 'Loading…' : 'Note')}</h2>
            <p className="text-sm text-muted-foreground">
              {note ? new Date(note.lastEditedDate).toLocaleString() : ' '}
              {subtitle ? <span>{` • ${subtitle}`}</span> : null}
              {note && note.sourceType === 'recording' ? (
                <span className="mt-1 block">Note language: {note.language}</span>
              ) : null}
            </p>
          </div>

          <div
            className="flex w-full items-center gap-2 rounded-lg border px-4 py-3 text-left text-sm font-medium"
            style={{
              backgroundColor: 'var(--brand-soft-bg)',
              color: 'var(--brand-deep)',
              borderColor: 'var(--brand-soft-border)',
            }}
          >
            <NoteKindIcon className="size-4 shrink-0 opacity-90" aria-hidden />
            <div className="min-w-0">
              <p className="truncate">{note?.title ?? 'Current note'}</p>
              <p className="text-xs font-normal opacity-80">{noteKindLabel}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm dark:bg-card/90">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="rounded-lg border border-border px-4 py-2 hover:bg-accent hover:text-accent-foreground"
            >
              ← Back to Home
            </button>
            {note?.sourceType === 'recording' ? (
              <button
                type="button"
                disabled={summarizing || loading || !note.rawText?.trim()}
                title={
                  !note?.rawText?.trim()
                    ? 'Add transcript text to this note before summarizing.'
                    : 'Generate an AI summary with Gemini'
                }
                onClick={() => void handleGeminiSummarize()}
                className="rounded-lg px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                {summarizing ? 'Generating…' : 'Summarize with Gemini'}
              </button>
            ) : null}
            {sessionUser ? (
              <span className="hidden rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground sm:inline">
                @{sessionUser.username}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <img src={logo} alt="ClassroomCompanion" className="h-10 w-auto" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-3xl">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-xl border border-border bg-card/95 p-10 shadow-sm backdrop-blur-sm dark:bg-card/90 sm:p-12"
            >
              {loading && <p className="text-center text-muted-foreground">Loading…</p>}
              {!loading && error ? <p className="text-center text-destructive">{error}</p> : null}
              {!loading && !error && note ? (
                <div className="space-y-6">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {firstName}&apos;s workspace
                    </p>
                    <h1 className="mt-1 text-3xl font-semibold tracking-tight">{note.title}</h1>
                  </div>
                  {note.sourceType === 'generated_summary' ? (
                    <div>
                      <h2 className="mb-3 text-2xl">AI summary</h2>
                      <div className="rounded-lg border border-border bg-muted/20 p-6">
                        <MarkdownPreview
                          markdown={(note.aiSummary ?? note.rawText).trim() || '_No summary content._'}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      {note.aiSummary ? (
                        <div>
                          <h2 className="mb-3 text-2xl">AI summary</h2>
                          <div className="rounded-lg border border-border bg-muted/20 p-6">
                            <MarkdownPreview markdown={note.aiSummary} />
                          </div>
                        </div>
                      ) : null}
                      <div>
                        <h2 className="mb-3 text-2xl">Note contents</h2>
                        <div className="rounded-lg border border-border bg-muted/10 p-6">
                          <MarkdownPreview markdown={note.rawText} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
