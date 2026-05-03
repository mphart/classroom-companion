import { Fragment } from 'react';

export type TranscriptToken = {
  word: string;
  confidence: number;
};

export type TranscriptRichPiece = {
  text: string;
  words?: TranscriptToken[];
};

/**
 * Absolute floor: clearly uncertain ASR tokens.
 * Relative gap: underline tokens noticeably weaker than the strongest word in the same phrase (common when all scores are 0.95+).
 */
export const LIVE_TRANSCRIPT_CONFIDENCE_ABSOLUTE = 0.88;
export const LIVE_TRANSCRIPT_CONFIDENCE_RELATIVE_GAP = 0.04;

/** @deprecated use ABSOLUTE + RELATIVE_GAP */
export const LIVE_TRANSCRIPT_CONFIDENCE_THRESHOLD = LIVE_TRANSCRIPT_CONFIDENCE_ABSOLUTE;

type Props = {
  committed: TranscriptRichPiece[];
  partial: TranscriptRichPiece | null;
};

export function isWordHighlighted(confidence: number, pieceConfidences: number[]): boolean {
  if (pieceConfidences.length === 0) return false;
  const max = Math.max(...pieceConfidences);
  if (confidence < LIVE_TRANSCRIPT_CONFIDENCE_ABSOLUTE) return true;
  if (pieceConfidences.length >= 2 && confidence < max - LIVE_TRANSCRIPT_CONFIDENCE_RELATIVE_GAP) return true;
  return false;
}

function renderPieceTokens(piece: TranscriptRichPiece) {
  if (!piece.words?.length) {
    return piece.text;
  }
  const confs = piece.words.map((w) => w.confidence);
  return piece.words.map((w, i) => {
    const mark = isWordHighlighted(w.confidence, confs);
    return (
      <Fragment key={i}>
        {i > 0 ? ' ' : ''}
        <span
          className={
            mark
              ? 'underline decoration-amber-500/75 dark:decoration-amber-400/65 decoration-[2.5px] underline-offset-[3px] transition-[text-decoration-color] duration-150'
              : undefined
          }
          title={mark ? `Lower confidence (${Math.round(w.confidence * 100)}%) — check this word` : undefined}
        >
          {w.word}
        </span>
      </Fragment>
    );
  });
}

/** Live transcript with per-word confidence underlines (Deepgram `words` array). Plain text when `words` is missing. */
export function TranscriptConfidenceText({ committed, partial }: Props) {
  const hasPartial = Boolean(partial?.text.trim());
  const hasWordTimings = committed.some((p) => p.words?.length) || (partial?.words?.length ?? 0) > 0;

  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap leading-relaxed text-foreground">
        {committed.map((piece, i) => (
          <Fragment key={`c-${i}`}>
            {i > 0 ? ' ' : ''}
            {renderPieceTokens(piece)}
          </Fragment>
        ))}
        {hasPartial && partial ? (
          <>
            {committed.length > 0 ? ' ' : ''}
            {renderPieceTokens(partial)}
          </>
        ) : null}
      </p>
      {hasWordTimings ? (
        <p className="text-xs text-muted-foreground flex items-start gap-2">
          <span
            className="inline-block w-7 shrink-0 mt-0.5 border-b-[2.5px] border-amber-500/75 dark:border-amber-400/65"
            aria-hidden
          />
          <span>
            Amber underline = weaker recognition vs. other words in the same phrase (or below {(LIVE_TRANSCRIPT_CONFIDENCE_ABSOLUTE * 100).toFixed(0)}% confidence). Edit those spots first.
          </span>
        </p>
      ) : null}
    </div>
  );
}

export function piecesPlainText(committed: TranscriptRichPiece[], partial: TranscriptRichPiece | null): string {
  const parts = committed.map((p) => p.text.trim()).filter(Boolean);
  const p = partial?.text.trim();
  if (p) parts.push(p);
  return parts.join(' ').trim();
}
