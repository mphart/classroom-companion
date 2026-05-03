import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';
import logo from '@/assets/corner-logo.svg';
import '@/styles/brand-ambient.css';
import { getNote, type NoteDto } from '@/app/lib/api';
import { PageAmbientDecor } from '@/app/components/PageAmbientDecor';
import { cn } from '@/app/components/ui/utils';

type DeckDoc = { version: 1; title: string; cards: { term: string; definition: string }[] };

type LocationState = { noteId?: number; browseDirectory?: string } | null;

type CardRating = 'learning' | 'known';

type FilterMode = 'all' | 'learning' | 'known';

function parseNoteIdFromSearch(searchParams: URLSearchParams): number | undefined {
  const raw = searchParams.get('noteId');
  if (raw == null || raw === '') return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return n;
}

function parseDeck(rawText: string): DeckDoc | null {
  try {
    const o = JSON.parse(rawText) as DeckDoc;
    if (o?.version !== 1 || !Array.isArray(o.cards)) return null;
    for (const c of o.cards) {
      if (typeof c.term !== 'string' || typeof c.definition !== 'string') return null;
    }
    return o.cards.length > 0 ? o : null;
  } catch {
    return null;
  }
}

function shuffleIndices(indices: number[]): number[] {
  const a = [...indices];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Flashcards() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const reduceMotion = useReducedMotion();

  const routeState = location.state as LocationState;
  const stateId = routeState?.noteId;
  const fromQuery = parseNoteIdFromSearch(searchParams);
  const noteId =
    typeof stateId === 'number' && Number.isInteger(stateId) && stateId > 0 ? stateId : fromQuery;

  const [note, setNote] = useState<NoteDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [position, setPosition] = useState(0);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [ratingByIndex, setRatingByIndex] = useState<Record<number, CardRating>>({});
  /** Original card indices in study order (may be shuffled). */
  const [activeOrder, setActiveOrder] = useState<number[]>([]);

  useEffect(() => {
    if (noteId === undefined) return;
    if (!searchParams.get('noteId')) {
      const browseDirectory = routeState?.browseDirectory;
      navigate(`/flashcards?noteId=${noteId}`, {
        replace: true,
        state:
          browseDirectory !== undefined ? { noteId, browseDirectory } : { noteId },
      });
    }
  }, [noteId, navigate, searchParams, routeState?.browseDirectory]);

  useEffect(() => {
    if (noteId === undefined) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const fetched = await getNote(noteId);
        if (!cancelled) {
          if (fetched.sourceType !== 'generated_flashcards') {
            setError('This note is not a flashcard deck.');
          } else if (!parseDeck(fetched.rawText)) {
            setError('This flashcard deck could not be read.');
          } else {
            setNote(fetched);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load deck');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  const deck = useMemo(() => (note ? parseDeck(note.rawText) : null), [note]);

  const browseDirectoryForBack = routeState?.browseDirectory ?? note?.directory;
  const goBackToLibrary = () => {
    navigate('/home', browseDirectoryForBack ? { state: { browseDirectory: browseDirectoryForBack } } : undefined);
  };

  const matching = useMemo(() => {
    if (!deck) return [] as number[];
    const out: number[] = [];
    for (let i = 0; i < deck.cards.length; i++) {
      const r = ratingByIndex[i];
      if (filter === 'all') out.push(i);
      else if (filter === 'learning') {
        if (r !== 'known') out.push(i);
      } else if (filter === 'known' && r === 'known') out.push(i);
    }
    return out;
  }, [deck, filter, ratingByIndex]);

  const matchingKey = matching.join(',');

  useEffect(() => {
    if (!deck) return;
    setActiveOrder([...matching]);
    setPosition(0);
    setFlipped(false);
  }, [deck, matchingKey]);

  const currentOriginalIndex = activeOrder[position] ?? activeOrder[0];
  const card =
    deck && currentOriginalIndex !== undefined ? deck.cards[currentOriginalIndex] : undefined;

  const markRating = (idx: number, r: CardRating) => {
    setRatingByIndex((prev) => ({ ...prev, [idx]: r }));
  };

  const goNext = () => {
    if (activeOrder.length <= 1) return;
    setFlipped(false);
    setPosition((p) => (p + 1) % activeOrder.length);
  };

  const goPrev = () => {
    if (activeOrder.length <= 1) return;
    setFlipped(false);
    setPosition((p) => (p - 1 + activeOrder.length) % activeOrder.length);
  };

  const handleShuffle = () => {
    setFlipped(false);
    setPosition(0);
    setActiveOrder((prev) => (prev.length > 0 ? shuffleIndices([...prev]) : prev));
  };

  if (noteId === undefined) {
    return <Navigate to="/home" replace />;
  }

  const deckTitle = deck?.title ?? note?.title ?? 'Flashcards';

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div
          className="brand-ambient-blob-a absolute -left-[14%] top-[-12%] h-[min(48vmin,20rem)] w-[min(48vmin,20rem)] rounded-full bg-[var(--brand)] opacity-[0.09] blur-[3.5rem]"
          style={{ animationDelay: '-2s' }}
        />
        <div
          className="brand-ambient-blob-b absolute -right-[8%] bottom-[8%] h-[min(42vmin,18rem)] w-[min(42vmin,18rem)] rounded-full bg-[var(--brand-deep)] opacity-[0.07] blur-[3rem]"
          style={{ animationDelay: '-5s' }}
        />
        <PageAmbientDecor />
      </div>

      <motion.header
        className="relative z-10 shrink-0 border-b border-border bg-card/95 backdrop-blur-sm dark:bg-card/90"
        initial={reduceMotion ? false : { opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="ClassroomCompanion" className="h-10 w-10 rounded-md" />
            <button
              type="button"
              onClick={goBackToLibrary}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              ← Back
            </button>
          </div>
          <h1 className="max-w-[min(100%,28rem)] truncate text-right text-lg font-semibold">{deckTitle}</h1>
        </div>
      </motion.header>

      {error ? (
        <div className="relative z-10 mx-auto w-full max-w-7xl px-6 py-4">
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        </div>
      ) : null}

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-6">
        {loading ? (
          <p className="text-center text-muted-foreground">Loading deck…</p>
        ) : !deck ? (
          <p className="text-center text-muted-foreground"> </p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
              {(['all', 'learning', 'known'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    filter === f
                      ? 'border-[var(--brand)] bg-[var(--brand-soft-bg)] text-foreground'
                      : 'border-border bg-muted/30 hover:bg-muted/50',
                  )}
                >
                  {f === 'all' ? 'All' : f === 'learning' ? 'Still learning' : 'Known'}
                </button>
              ))}
              <button
                type="button"
                onClick={handleShuffle}
                disabled={activeOrder.length === 0}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-medium hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Shuffle className="size-3.5" aria-hidden />
                Shuffle
              </button>
            </div>

            {activeOrder.length === 0 ? (
              <p className="mb-6 text-center text-sm text-muted-foreground">
                No cards in this view. Use the filters above to switch to All or Still learning.
              </p>
            ) : null}

            {activeOrder.length > 0 ? (
              <>
            <p className="mb-4 text-center text-sm text-muted-foreground">
              Card {position + 1} of {activeOrder.length}
              {typeof currentOriginalIndex === 'number' && ratingByIndex[currentOriginalIndex] === 'known'
                ? ' · Marked known'
                : null}
            </p>

            <div className="mx-auto mb-6 w-full max-w-lg [perspective:1200px]">
              <button
                type="button"
                onClick={() => setFlipped((v) => !v)}
                className="relative aspect-[4/3] w-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                aria-label={flipped ? 'Show term' : 'Show definition'}
              >
                <div
                  className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
                  style={{
                    transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  }}
                >
                  <div
                    className="absolute inset-0 flex items-center justify-center rounded-2xl border border-border bg-card p-6 shadow-lg [backface-visibility:hidden]"
                  >
                    <div className="max-h-full overflow-y-auto text-center">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Term</p>
                      <p className="text-xl font-semibold leading-snug">{card?.term}</p>
                    </div>
                  </div>
                  <div
                    className="absolute inset-0 flex items-center justify-center rounded-2xl border border-border bg-muted/40 p-6 shadow-lg [backface-visibility:hidden]"
                    style={{ transform: 'rotateY(180deg)' }}
                  >
                    <div className="max-h-full overflow-y-auto text-center">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Definition
                      </p>
                      <p className="text-base leading-relaxed text-foreground">{card?.definition}</p>
                    </div>
                  </div>
                </div>
              </button>
              <p className="mt-2 text-center text-xs text-muted-foreground">Tap the card to flip</p>
            </div>

            {typeof currentOriginalIndex === 'number' ? (
              <div className="mb-6 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => markRating(currentOriginalIndex, 'learning')}
                  className={cn(
                    'rounded-lg border px-4 py-2 text-sm',
                    ratingByIndex[currentOriginalIndex] !== 'known'
                      ? 'border-[var(--brand)] bg-[var(--brand-soft-bg)]'
                      : 'border-border hover:bg-muted/50',
                  )}
                >
                  Still learning
                </button>
                <button
                  type="button"
                  onClick={() => markRating(currentOriginalIndex, 'known')}
                  className={cn(
                    'rounded-lg border px-4 py-2 text-sm',
                    ratingByIndex[currentOriginalIndex] === 'known'
                      ? 'border-emerald-600/60 bg-emerald-500/15'
                      : 'border-border hover:bg-muted/50',
                  )}
                >
                  Known
                </button>
              </div>
            ) : null}

            <div className="mt-auto flex items-center justify-center gap-4 pb-8">
              <button
                type="button"
                onClick={goPrev}
                disabled={activeOrder.length <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted/50 disabled:opacity-40"
              >
                <ChevronLeft className="size-4" aria-hidden />
                Previous
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={activeOrder.length <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted/50 disabled:opacity-40"
              >
                Next
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
