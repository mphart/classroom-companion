import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import logo from '@/assets/corner-logo.svg';
import {
  getNote,
  gradePracticeExamShortAnswers,
  type GradeVerdict,
  type NoteDto,
} from '@/app/lib/api';
import { Label } from '@/app/components/ui/label';
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

type LocationState = { noteId?: number } | null;

export function PracticeExam() {
  const navigate = useNavigate();
  const location = useLocation();
  const noteId = (location.state as LocationState)?.noteId;

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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border bg-card shrink-0">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="ClassroomCompanion" className="h-10 w-10 rounded-md" />
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="px-3 py-2 border border-border rounded-lg hover:bg-accent hover:text-accent-foreground text-sm"
            >
              ← Home
            </button>
          </div>
          <h1 className="text-lg font-semibold truncate max-w-[50%] text-right">
            {exam?.title ?? note?.title ?? 'Practice exam'}
          </h1>
        </div>
      </header>

      {error ? (
        <div className="max-w-7xl mx-auto px-6 py-4 w-full">
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 min-h-0">
        <aside className="w-56 shrink-0 border-r border-border bg-card p-4 flex flex-col gap-2">
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
          <p className="text-sm text-muted-foreground pt-2 border-t border-border">
            {checked ? `${questions.length}/${questions.length} reviewed` : `${completedCount}/${questions.length} comp.`}
          </p>
        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-6 md:p-8 pb-32">
            <div className="max-w-3xl mx-auto space-y-10">
              {loading && <p className="text-muted-foreground">Loading exam…</p>}
              {!loading && !error && exam && (
                <>
                  {exam.questions.map((q, i) => (
                    <section key={i} className="rounded-lg border border-border bg-card p-6 shadow-sm">
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
                            className="gap-3"
                          >
                            {q.options.map((opt, j) => (
                              <div key={j} className="flex items-center gap-3">
                                <RadioGroupItem value={String(j)} id={`q${i}-o${j}`} />
                                <Label htmlFor={`q${i}-o${j}`} className="font-normal cursor-pointer">
                                  {opt}
                                </Label>
                              </div>
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
                    </section>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-border bg-card py-4 px-6 flex justify-center">
            <button
              type="button"
              disabled={loading || !!error || !exam || checked || checking}
              onClick={() => void handleCheck()}
              className="px-8 py-2.5 text-white rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              {checking ? 'Checking…' : 'Check'}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
