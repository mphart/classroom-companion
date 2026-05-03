import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Loader2, Lock, Presentation, Unlock, X } from 'lucide-react';
import { useSlideRenderer } from '@/app/lib/useSlideRenderer';

type RecordingSlidePanelProps = {
  deckTitle: string;
  pdfBlobUrl: string;
  currentSlide: number;
  confidence: number;
  isLocked: boolean;
  isLoading: boolean;
  driftHint?: boolean;
  /** Notify parent once the deck is open and we know how many pages it has. */
  onPageCountKnown?: (count: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleLock: () => void;
  onDetach: () => void;
};

function confidenceTone(confidence: number) {
  if (confidence >= 0.7) {
    return { dot: 'bg-emerald-500', label: 'Strong match', text: 'text-emerald-700 dark:text-emerald-400' };
  }
  if (confidence >= 0.4) {
    return { dot: 'bg-amber-500', label: 'Likely match', text: 'text-amber-700 dark:text-amber-400' };
  }
  return { dot: 'bg-muted-foreground/60', label: 'Listening…', text: 'text-muted-foreground' };
}

export function RecordingSlidePanel(props: RecordingSlidePanelProps) {
  const reduceMotion = useReducedMotion();
  const { pageCount, error, getPage } = useSlideRenderer(props.pdfBlobUrl);
  const tone = confidenceTone(props.confidence);

  useEffect(() => {
    if (pageCount > 0) props.onPageCountKnown?.(pageCount);
    // We deliberately depend only on `pageCount` so we don't re-fire when callbacks change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCount]);

  const safeSlide =
    pageCount > 0 ? Math.min(Math.max(1, Math.floor(props.currentSlide)), pageCount) : props.currentSlide;
  const dataUrl = pageCount > 0 ? getPage(safeSlide) : null;

  return (
    <div className="rounded-xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur-sm dark:bg-card/90">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Presentation className="size-4 shrink-0 text-[var(--brand)]" aria-hidden />
          <p className="truncate text-sm font-semibold text-foreground" title={props.deckTitle}>
            {props.deckTitle}
          </p>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
            {pageCount > 0 ? `Slide ${safeSlide} of ${pageCount}` : 'Loading deck…'}
          </span>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 text-[0.7rem] font-medium ${tone.text}`}
            title={`Confidence ${(props.confidence * 100).toFixed(0)}%`}
          >
            <span className={`relative flex h-2 w-2 rounded-full ${tone.dot}`} aria-hidden>
              {props.confidence >= 0.7 && !props.isLocked ? (
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${tone.dot} opacity-50`} />
              ) : null}
            </span>
            {props.isLocked ? 'Locked' : tone.label}
            {props.isLoading ? (
              <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            ) : null}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={props.onPrev}
            disabled={pageCount === 0 || safeSlide <= 1}
            className="rounded-md border border-border bg-background p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
            aria-label="Previous slide"
            title="Previous slide (locks auto-sync)"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={props.onNext}
            disabled={pageCount === 0 || safeSlide >= pageCount}
            className="rounded-md border border-border bg-background p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
            aria-label="Next slide"
            title="Next slide (locks auto-sync)"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={props.onToggleLock}
            className={
              props.isLocked
                ? 'rounded-md border border-[var(--brand)]/40 bg-[var(--brand-soft-bg)] p-1.5 text-[var(--brand-deep)] transition-colors dark:text-[var(--brand)]'
                : 'rounded-md border border-border bg-background p-1.5 text-muted-foreground transition-colors hover:bg-muted'
            }
            aria-label={props.isLocked ? 'Unlock auto-sync' : 'Lock current slide'}
            title={props.isLocked ? 'Unlock — let the AI follow along again' : 'Lock — keep this slide pinned'}
          >
            {props.isLocked ? <Lock className="size-4" aria-hidden /> : <Unlock className="size-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={props.onDetach}
            className="rounded-md border border-border bg-background p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Remove slide deck from this session"
            title="Detach deck"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="relative mx-auto flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
        {error ? (
          <p className="px-4 text-center text-sm text-destructive">{error}</p>
        ) : !dataUrl ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            <p className="text-xs">{pageCount === 0 ? 'Opening PDF…' : `Rendering slide ${safeSlide}…`}</p>
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.img
              key={`slide-${safeSlide}`}
              src={dataUrl}
              alt={`Slide ${safeSlide}`}
              draggable={false}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="max-h-full max-w-full select-none object-contain"
            />
          </AnimatePresence>
        )}
      </div>

      {props.driftHint && !props.isLocked ? (
        <p className="mt-2 text-[0.7rem] text-muted-foreground">
          Audio is drifting from the deck — tap the lock icon to pin a slide for the demo.
        </p>
      ) : null}
    </div>
  );
}
