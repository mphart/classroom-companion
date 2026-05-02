import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import logo from '@/imports/classroomcompanion_logo_v4.svg';
import { getNote, type NoteDto } from '@/app/lib/api';

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

  if (!noteId) {
    return <Navigate to="/home" replace />;
  }

  const subtitle =
    note && note.sourceType === 'generated_summary' && typeof note.generatedFromCount === 'number'
      ? `Generated • ${note.generatedFromCount} source notes`
      : note
        ? 'Saved note'
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
        <div className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/home')}
              className="px-4 py-2 border border-border rounded-lg hover:bg-accent hover:text-accent-foreground"
            >
              ← Back to Home
            </button>
          </div>
          <div className="flex items-center gap-3">
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
                  {note.aiSummary ? (
                    <div>
                      <h2 className="text-2xl mb-3">AI Summary</h2>
                      <pre className="whitespace-pre-wrap text-sm bg-muted/40 border border-border rounded-lg p-4">
                        {note.aiSummary}
                      </pre>
                    </div>
                  ) : null}
                  <div>
                    <h2 className="text-2xl mb-3">Content</h2>
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed">{note.rawText}</pre>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
