import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import logo from '@/assets/corner-logo.svg';
import '@/styles/brand-ambient.css';
import { PageAmbientDecor } from '@/app/components/PageAmbientDecor';
import {
  getNote,
  gradePracticeExamShortAnswers,
  type GradeVerdict,
  type NoteDto,
} from '@/app/lib/api';
import { RadioGroup, RadioGroupItem } from '@/app/components/ui/radio-group';
import { Textarea } from '@/app/components/ui/textarea';

type ExamMc = {
  type: 'multiple_choice';
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
};

type ExamSa = {
  type: 'short_answer';
  prompt: string;
  referenceAnswer: string;
};

type ExamQuestion = ExamMc | ExamSa;

type ExamDoc = { version: 1; title: string; questions: ExamQuestion[] };

function parseExamDoc(rawText: string): ExamDoc | null {
  try {
    const o = JSON.parse(rawText) as ExamDoc;
    if (o?.version !== 1 || !Array.isArray(o.questions)) return null;
    for (const q of o.questions) {
      if (q.type === 'multiple_choice') {
        if (!Array.isArray(q.options) || typeof q.correctIndex !== 'number') return null;
        if (q.correctIndex < 0 || q.correctIndex >= q.options.length) return null;
      } else if (q.type === 'short_answer') {
        if (typeof q.referenceAnswer !== 'string') return null;
      } else return null;
    }
    return o;
  } catch {
    return null;
  }
}

type LocationState = { noteId?: number; browseDirectory?: string } | null;

export function PracticeExam() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const routeState = location.state as LocationState;
  const noteId = routeState?.noteId;
  const browseDirectoryFromState = routeState?.browseDirectory;

  const [note, setNote] = useState<NoteDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mcChoice, setMcChoice] = useState<Record<number, string>>({});
  const [saText, setSaText] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [mcResult, setMcResult] = useState<Record<number, { ok: boolean; explanation?: string }>>({});
  const [saResult, setSaResult] = useState<
    Record<number, { verdict: GradeVerdict; feedback: string }>
  >({});

  const exam = useMemo(() => (note ? parseExamDoc(note.rawText) : null), [note]);

  useEffect(() => {
    if (noteId === undefined) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const fetched = await getNote(noteId);
        if (!cancelled) {
          if (fetched.sourceType !== 'generated_practice_exam') {
            setError('This note is not a practice exam.');
          } else if (!parseExamDoc(fetched.rawText)) {
            setError('This practice exam could not be read.');
          } else {
            setNote(fetched);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load exam');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  const questions = exam?.questions ?? [];

  const isQuestionComplete = useCallback(
    (index: number) => {
      const q = questions[index];
      if (!q) return false;
      if (q.type === 'multiple_choice') {
        return mcChoice[index] !== undefined && mcChoice[index] !== '';
      }
      return (saText[index] ?? '').trim().length > 0;
    },
    [questions, mcChoice, saText],
  );

  const completedCount = useMemo(
    () => questions.reduce((n, _, i) => n + (isQuestionComplete(i) ? 1 : 0), 0),
    [questions, isQuestionComplete],
  );

  const handleCheck = async () => {
    if (!exam || !noteId) return;
    setChecking(true);
    setError('');
    const mc: Record<number, { ok: boolean; explanation?: string }> = {};
    for (let i = 0; i < exam.questions.length; i++) {
      const q = exam.questions[i];
      if (q.type !== 'multiple_choice') continue;
      const selected = mcChoice[i];
      const selectedIdx = selected !== undefined && selected !== '' ? Number(selected) : -1;
      mc[i] = {
        ok: selectedIdx === q.correctIndex,
        explanation: q.explanation,
      };
    }
    setMcResult(mc);

    const saPayload: { questionIndex: number; answer: string }[] = [];
    for (let i = 0; i < exam.questions.length; i++) {
      if (exam.questions[i].type === 'short_answer') {
        saPayload.push({ questionIndex: i, answer: saText[i] ?? '' });
      }
    }

    let saGrades: Record<number, { verdict: GradeVerdict; feedback: string }> = {};
    if (saPayload.length > 0) {
      try {
        const { results } = await gradePracticeExamShortAnswers({ noteId, responses: saPayload });
        saGrades = Object.fromEntries(results.map((r) => [r.questionIndex, r]));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to grade short answers');
        setChecking(false);
        return;
      }
    }
    setSaResult(saGrades);
    setChecked(true);
    setChecking(false);
  };

  if (noteId === undefined) {
    return <Navigate to="/home" replace />;
  }

  const browseDirectoryForBack = browseDirectoryFromState ?? note?.directory;
  const goBackToLibrary = () => {
    navigate('/home', browseDirectoryForBack ? { state: { browseDirectory: browseDirectoryForBack } } : undefined);
  };

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
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="ClassroomCompanion" className="h-10 w-10 rounded-md" />
            <button
              type="button"
              onClick={goBackToLibrary}
              className="px-3 py-2 border border-border rounded-lg hover:bg-accent hover:text-accent-foreground text-sm"
            >
              ← Back
            </button>
          </div>
          <h1 className="max-w-[50%] truncate text-right text-lg font-semibold">
            {exam?.title ?? note?.title ?? 'Practice exam'}
          </h1>
        </div>
      </motion.header>

      {error ? (
        <div className="relative z-10 mx-auto w-full max-w-7xl px-6 py-4">
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        </div>
      ) : null}

      <div className="relative z-10 flex min-h-0 flex-1">
        <motion.aside
          className="flex w-56 shrink-0 flex-col gap-2 border-r border-border bg-card/95 p-4 backdrop-blur-sm dark:bg-card/90"
          initial={reduceMotion ? false : { opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.38, delay: reduceMotion ? 0 : 0.05, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-sm font-medium text-muted-foreground mb-2">Questions</p>
          <ol className="space-y-2 flex-1 overflow-y-auto">
            {questions.map((_, i) => {
              const done = checked || isQuestionComplete(i);
              return (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="text-base" aria-hidden>
                    {done ? '✓' : '—'}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="border-t border-border pt-2 text-sm text-muted-foreground">
            {checked ? `${questions.length}/${questions.length} reviewed` : `${completedCount}/${questions.length} comp.`}
          </p>
        </motion.aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-6 md:p-8 pb-32">
            <div className="max-w-3xl mx-auto space-y-10">
              {loading && <p className="text-muted-foreground">Loading exam…</p>}
              {!loading && !error && exam && (
                <>
                  {exam.questions.map((q, i) => (
                    <motion.section
                      key={i}
                      className="rounded-lg border border-border bg-card p-6 shadow-sm"
                      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-40px' }}
                      transition={{
                        duration: 0.38,
                        delay: reduceMotion ? 0 : Math.min(i, 12) * 0.03,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      <h2 className="text-base font-semibold mb-3">
                        Question {i + 1}:{' '}
                        <span className="font-normal text-foreground">{q.prompt}</span>
                      </h2>
                      {q.type === 'multiple_choice' ? (
                        <div className="space-y-3">
                          <RadioGroup
                            value={mcChoice[i] ?? ''}
                            onValueChange={(v) => setMcChoice((prev) => ({ ...prev, [i]: v }))}
                            disabled={checked}
                            className="gap-2.5"
                          >
                            {q.options.map((opt, j) => (
                              <label
                                key={j}
                                htmlFor={`q${i}-o${j}`}
                                className={[
                                  'flex cursor-pointer items-start gap-3.5 rounded-xl border-2 p-3.5 transition-colors',
                                  'border-muted-foreground/30 bg-muted/25 hover:border-foreground/45 hover:bg-muted/40',
                                  'has-[[data-state=checked]]:border-[var(--brand)] has-[[data-state=checked]]:bg-[var(--brand-soft-bg)]',
                                  'has-[[data-state=checked]]:shadow-md dark:has-[[data-state=checked]]:shadow-[0_0_0_1px_rgba(255,255,255,0.06)]',
                                  checked ? 'cursor-default opacity-90' : '',
                                ].join(' ')}
                              >
                                <RadioGroupItem
                                  value={String(j)}
                                  id={`q${i}-o${j}`}
                                  className="mt-0.5 border-foreground/40 data-[state=checked]:border-primary"
                                />
                                <span className="text-[15px] leading-snug text-foreground">{opt}</span>
                              </label>
                            ))}
                          </RadioGroup>
                          {checked && mcResult[i] ? (
                            <p
                              className={`text-sm mt-2 ${mcResult[i].ok ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}
                            >
                              {mcResult[i].ok ? 'Correct.' : 'Incorrect.'}
                              {mcResult[i].explanation ? ` ${mcResult[i].explanation}` : ''}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Textarea
                            value={saText[i] ?? ''}
                            onChange={(e) => setSaText((prev) => ({ ...prev, [i]: e.target.value }))}
                            disabled={checked}
                            placeholder="Your answer"
                            className="min-h-[100px]"
                          />
                          {checked && saResult[i] ? (
                            <div className="text-sm rounded-md border border-border bg-muted/30 p-3 space-y-1">
                              <p className="font-medium capitalize">{saResult[i].verdict.replace('_', ' ')}</p>
                              <p className="text-muted-foreground">{saResult[i].feedback}</p>
                              <p className="text-xs text-muted-foreground pt-1">
                                Reference: {q.referenceAnswer}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </motion.section>
                  ))}
                </>
              )}
            </div>
          </div>

          <motion.div
            className="flex shrink-0 justify-center border-t border-border bg-card/95 px-6 py-4 backdrop-blur-sm dark:bg-card/90"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: reduceMotion ? 0 : 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.button
              type="button"
              disabled={loading || !!error || !exam || checked || checking}
              onClick={() => void handleCheck()}
              className="rounded-lg px-8 py-2.5 text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand)' }}
              whileTap={reduceMotion || loading || !!error || !exam || checked || checking ? undefined : { scale: 0.97 }}
            >
              {checking ? 'Checking…' : 'Check'}
            </motion.button>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
