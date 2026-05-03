import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import logo from '@/imports/classroomcompanion_logo_v4.svg';
import { getNote, regenerateNoteAiSummary, type NoteDto } from '@/app/lib/api';
import { MarkdownPreview } from '@/app/components/MarkdownPreview';
import { ThemeToggle } from '@/app/components/ThemeToggle';

type ViewerState = {
  noteId?: number;
} | null;

export function Viewer() {
  const navigate = useNavigate();
  const location = useLocation();
  const viewerState = (location.state as ViewerState) ?? null;

  const noteId = viewerState?.noteId;
  const [note, setNote] = useState<NoteDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState('');

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
    if (noteId === undefined || !note?.rawText.trim()) return;
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

  const subtitle =
    note && note.sourceType === 'generated_summary' && typeof note.generatedFromCount === 'number'
      ? `Gemini-generated • merged from ${note.generatedFromCount} source note(s)`
      : note && note.sourceType === 'generated_practice_exam' && typeof note.generatedFromCount === 'number'
        ? `Practice exam • from ${note.generatedFromCount} source note(s)`
        : note
          ? note.sourceType === 'generated_summary'
            ? 'Gemini-generated summary note'
            : note.sourceType === 'generated_practice_exam'
              ? 'Generated practice exam'
              : 'Saved lecture note'
          : '';

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <div className="w-80 shrink-0 bg-card border-r border-border">
        <div className="p-6">
          <div className="mb-6">
            <h2 className="text-lg mb-1">{note?.title ?? (loading ? 'Loading…' : 'Note')}</h2>
            <p className="text-sm text-muted-foreground">
              {note ? new Date(note.lastEditedDate).toLocaleString() : ' '}
              {subtitle ? <span>{` • ${subtitle}`}</span> : null}
            </p>
          </div>

          <button
            type="button"
            disabled
            className="w-full text-left px-4 py-3 rounded-lg border"
            style={{
              backgroundColor: 'var(--brand-soft-bg)',
              color: 'var(--brand-deep)',
              borderColor: 'var(--brand-soft-border)',
            }}
          >
            {note?.title ?? 'Current note'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="bg-card border-b border-border px-6 py-4 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={() => navigate('/home')}
              className="px-4 py-2 border border-border rounded-lg hover:bg-accent hover:text-accent-foreground"
            >
              ← Back to Home
            </button>
            {note?.sourceType === 'recording' ? (
              <button
                type="button"
                disabled={summarizing || loading || !note.rawText.trim()}
                onClick={() => void handleGeminiSummarize()}
                className="px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                {summarizing ? 'Generating…' : 'Summarize with Gemini'}
              </button>
            ) : null}
            {note?.sourceType === 'generated_practice_exam' && noteId !== undefined ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => navigate('/practice-exam', { state: { noteId } })}
                className="px-4 py-2 text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                Open practice exam
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <img src={logo} alt="ClassroomCompanion" className="h-10 w-auto" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto">
            <div className="bg-card border border-border rounded-lg shadow-sm p-12">
              {loading && <p className="text-muted-foreground text-center">Loading…</p>}
              {!loading && error ? <p className="text-destructive text-center">{error}</p> : null}
              {!loading && !error && note ? (
                <div className="space-y-6">
                  <h1 className="text-3xl mt-2">{note.title}</h1>
                  {note.sourceType === 'generated_practice_exam' ? (
                    <div className="rounded-lg border border-border bg-muted/20 p-8 text-center space-y-4">
                      <p className="text-muted-foreground">
                        This item is an interactive practice exam. Open it to answer questions and check your work.
                      </p>
                      {noteId !== undefined ? (
                        <button
                          type="button"
                          onClick={() => navigate('/practice-exam', { state: { noteId } })}
                          className="px-6 py-2.5 text-white rounded-lg"
                          style={{ backgroundColor: 'var(--brand)' }}
                        >
                          Open practice exam
                        </button>
                      ) : null}
                    </div>
                  ) : note.sourceType === 'generated_summary' ? (
                    <div>
                      <h2 className="text-2xl mb-3">AI summary</h2>
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
                          <h2 className="text-2xl mb-3">AI summary</h2>
                          <div className="rounded-lg border border-border bg-muted/20 p-6">
                            <MarkdownPreview markdown={note.aiSummary} />
                          </div>
                        </div>
                      ) : null}
                      <div>
                        <h2 className="text-2xl mb-3">Note contents</h2>
                        <div className="rounded-lg border border-border bg-muted/10 p-6">
                          <MarkdownPreview markdown={note.rawText} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
