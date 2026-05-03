import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import {
  BookText,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Languages,
  Loader2,
  MessageCircleQuestion,
  Mic,
  Presentation,
  Sparkles,
  Upload,
} from 'lucide-react';
import cornerLogo from '@/assets/corner-logo.svg';
import '@/styles/brand-ambient.css';
import { MarkdownPreview } from '@/app/components/MarkdownPreview';
import { PageAmbientDecor } from '@/app/components/PageAmbientDecor';
import { RecordingSlidePanel } from '@/app/components/RecordingSlidePanel';
import {
  createFolder,
  createNote,
  extractJargon,
  fetchNotePdfBlob,
  getNote,
  listItems,
  matchCurrentSlide,
  sessionQaAsk,
  uploadSlidePdf,
  type ListedItemDto,
} from '@/app/lib/api';
import {
  extractImportantDatesFromTranscript,
  extractTranscriptSection,
} from '@/app/lib/extractImportantDatesFromTranscript';
import {
  appendImportantEventsFromRecording,
  queueImportantAlertsForHome,
} from '@/app/lib/importantEventsStorage';
import { floatToPCM16 } from '@/app/lib/audioPcm16k';
import { getSessionUser, getToken } from '@/app/lib/authSession';
import { firstNameFromDisplayName, timeOfDayGreeting, userInitials } from '@/app/lib/personalGreeting';
import { joinDirectory, userRootDirectory } from '@/app/lib/pathUtils';
import { buildConfigureMessage, getTranscriptionStreamUrl } from '@/app/lib/transcriptionWs';
import {
  piecesPlainText,
  TranscriptConfidenceText,
  type TranscriptRichPiece,
  type TranscriptToken,
} from '@/app/components/TranscriptConfidenceText';

const BUFFER_SIZE = 4096;

/** `<select>` value for saving to your library root (same as Home). */
const SAVE_TO_HOME_VALUE = '__library_home__';

/** Must match backend `SESSION_QA_TRANSCRIPT_WINDOW` for context sent to Session Q&A. */
const SESSION_QA_CHAR_WINDOW = 8000;

/** Live glossary: minimum new words since last scan before calling `/ai/jargon/extract`. */
const JARGON_SCAN_WORD_THRESHOLD = 25;
/** Client-side minimum gap between jargon API calls (ms); server also enforces 8s. */
const JARGON_CLIENT_COOLDOWN_MS = 12_000;

/** Slide sync: minimum new transcript words since last call before re-asking Gemini. */
const SLIDE_SYNC_WORD_THRESHOLD = 30;
/** Client-side minimum gap between `/ai/slide-match` calls (ms); server enforces 8s too. */
const SLIDE_SYNC_CLIENT_COOLDOWN_MS = 10_000;
/** Recent transcript window sent to slide match (chars; matches backend SLIDE_MATCH_TRANSCRIPT_WINDOW). */
const SLIDE_SYNC_TRANSCRIPT_WINDOW = 1500;
/** Confidence threshold below which we keep the previous slide pinned. */
const SLIDE_SYNC_MIN_CONFIDENCE = 0.5;
/** Show the "drifting" hint after this many consecutive low-confidence calls. */
const SLIDE_SYNC_DRIFT_THRESHOLD = 2;

/** Bars in the live mic spectrum meter (voice band is spread across these bins). */
const MIC_METER_BARS = 40;
const MIC_METER_EMIT_MS = 45;

const DEFAULT_DOCUMENT_TITLE = 'Classroom Companion';
const RECORDING_DOCUMENT_TITLE = '● Recording · Classroom Companion';

const SESSION_QA_SUGGESTED_PROMPTS = [
  'What was the last main idea I explained?',
  'Summarize that in one sentence.',
  'What example did I use to illustrate it?',
] as const;

type TranscriptInbound = {
  type: string;
  text?: string;
  words?: TranscriptToken[];
  message?: string;
};

function parseInboundWords(raw: unknown): TranscriptToken[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: TranscriptToken[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as { word?: unknown; confidence?: unknown };
    if (typeof o.word !== 'string' || !o.word.trim()) continue;
    let confidence = 1;
    if (typeof o.confidence === 'number' && Number.isFinite(o.confidence)) {
      confidence = o.confidence;
    } else if (typeof o.confidence === 'string' && o.confidence.trim() !== '') {
      const n = Number(o.confidence);
      if (Number.isFinite(n)) confidence = n;
    }
    out.push({ word: o.word, confidence });
  }
  return out.length > 0 ? out : undefined;
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function inboundToPiece(parsed: TranscriptInbound): TranscriptRichPiece | null {
  const text = typeof parsed.text === 'string' ? parsed.text : '';
  if (!text.trim()) return null;
  const words = parseInboundWords(parsed.words);
  return { text, ...(words ? { words } : {}) };
}

export function ActiveRecording() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const sessionUser = getSessionUser();
  const userId = sessionUser?.id ?? null;

  const userRoot = useMemo(() => (userId === null ? null : userRootDirectory(userId)), [userId]);

  const [lectureName, setLectureName] = useState(() => {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `Lecture-${month}-${day}`;
  });
  const [courseFolders, setCourseFolders] = useState<ListedItemDto[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [language, setLanguage] = useState('English');
  const [notes, setNotes] = useState<string[]>(['']);
  const [transcriptCommittedPieces, setTranscriptCommittedPieces] = useState<TranscriptRichPiece[]>([]);
  const [transcriptPartialPiece, setTranscriptPartialPiece] = useState<TranscriptRichPiece | null>(null);
  const [sttStatus, setSttStatus] = useState<{ kind: 'idle' | 'connecting' | 'live' | 'error'; message?: string }>({
    kind: 'idle',
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [saveLocation, setSaveLocation] = useState<'home' | 'course'>('home');
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [sessionQaOpen, setSessionQaOpen] = useState(true);
  const [sessionQaInput, setSessionQaInput] = useState('');
  const [sessionQaLoading, setSessionQaLoading] = useState(false);
  const [sessionQaMessages, setSessionQaMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [micSpectrum, setMicSpectrum] = useState<number[]>(() => Array.from({ length: MIC_METER_BARS }, () => 0));

  const [jargonOpen, setJargonOpen] = useState(true);
  const [jargonTerms, setJargonTerms] = useState<{ term: string; definition: string; addedAt: number }[]>([]);
  const [jargonLoading, setJargonLoading] = useState(false);
  const [expandedJargonKey, setExpandedJargonKey] = useState<string | null>(null);

  type SlideDeckState = {
    noteId: number;
    title: string;
    pdfBlobUrl: string;
    pageCount: number;
  };
  const [availableDecks, setAvailableDecks] = useState<ListedItemDto[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [slideDeck, setSlideDeck] = useState<SlideDeckState | null>(null);
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(1);
  const [slideConfidence, setSlideConfidence] = useState(0);
  const [slideMatchLoading, setSlideMatchLoading] = useState(false);
  const [lockedSlide, setLockedSlide] = useState<number | null>(null);
  const [lowConfidenceStreak, setLowConfidenceStreak] = useState(0);

  const slidePdfInputRef = useRef<HTMLInputElement | null>(null);
  const lastSlideScanLenRef = useRef(0);
  const lastSlideCallAtRef = useRef(0);
  const slideMatchInFlightRef = useRef(false);

  const transcriptionWsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micMeterRafRef = useRef(0);
  const micMeterLastEmitRef = useRef(0);

  const isPausedRef = useRef(false);
  const transcriptCommittedPiecesRef = useRef<TranscriptRichPiece[]>([]);
  const transcriptPartialPieceRef = useRef<TranscriptRichPiece | null>(null);

  const lastJargonScanLenRef = useRef(0);
  const lastJargonCallAtRef = useRef(0);
  const jargonInFlightRef = useRef(false);
  const jargonTermsRef = useRef(jargonTerms);
  jargonTermsRef.current = jargonTerms;

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  const stopMicMeterLoop = useCallback(() => {
    cancelAnimationFrame(micMeterRafRef.current);
    micMeterRafRef.current = 0;
    micMeterLastEmitRef.current = 0;
    setMicSpectrum(Array.from({ length: MIC_METER_BARS }, () => 0));
  }, []);

  const teardownAudioGraph = useCallback(() => {
    stopMicMeterLoop();
    try {
      analyserRef.current?.disconnect();
      scriptProcessorRef.current?.disconnect();
      mediaSourceRef.current?.disconnect();
      muteGainRef.current?.disconnect();
    } catch {
      /* noop */
    }
    analyserRef.current = null;
    scriptProcessorRef.current = null;
    mediaSourceRef.current = null;
    muteGainRef.current = null;
  }, [stopMicMeterLoop]);

  const startMicMeterLoop = useCallback(() => {
    cancelAnimationFrame(micMeterRafRef.current);
    const zeros = () => Array.from({ length: MIC_METER_BARS }, () => 0);
    const tick = (now: number) => {
      micMeterRafRef.current = requestAnimationFrame(tick);
      const an = analyserRef.current;
      if (!an) return;

      if (isPausedRef.current) {
        if (now - micMeterLastEmitRef.current > 120) {
          micMeterLastEmitRef.current = now;
          setMicSpectrum(zeros());
        }
        return;
      }

      const buf = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(buf);
      const bins = Math.max(1, Math.floor(buf.length * 0.88));
      const chunk = bins / MIC_METER_BARS;
      const bars: number[] = [];
      for (let i = 0; i < MIC_METER_BARS; i++) {
        let m = 0;
        const start = Math.floor(i * chunk);
        const end = Math.min(bins, Math.floor((i + 1) * chunk));
        for (let j = start; j < end; j++) m = Math.max(m, buf[j] ?? 0);
        bars.push(m / 255);
      }

      if (now - micMeterLastEmitRef.current >= MIC_METER_EMIT_MS) {
        micMeterLastEmitRef.current = now;
        setMicSpectrum(bars);
      }
    };
    micMeterRafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopMediaTracks = () => {
    mediaStreamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* noop */
      }
    });
    mediaStreamRef.current = null;
  };

  const closeTranscriptionWs = (code?: number) => {
    const ws = transcriptionWsRef.current;
    transcriptionWsRef.current = null;
    if (!ws) return;
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }));
    } catch {
      /* noop */
    }
    try {
      ws.close(code ?? 1000);
    } catch {
      /* noop */
    }
  };

  const fullTranscriptPlain = useMemo(
    () => piecesPlainText(transcriptCommittedPieces, transcriptPartialPiece),
    [transcriptCommittedPieces, transcriptPartialPiece],
  );

  const transcriptForSessionQa = useMemo(() => {
    const t = fullTranscriptPlain.replace(/\s+/g, ' ').trim();
    if (!t) return '';
    return t.length <= SESSION_QA_CHAR_WINDOW ? t : t.slice(-SESSION_QA_CHAR_WINDOW);
  }, [fullTranscriptPlain]);

  useEffect(() => {
    if (!isRecording || isPaused) return;
    const deltaStart = lastJargonScanLenRef.current;
    const delta = fullTranscriptPlain.slice(deltaStart);
    if (countWords(delta) < JARGON_SCAN_WORD_THRESHOLD) return;
    if (Date.now() - lastJargonCallAtRef.current < JARGON_CLIENT_COOLDOWN_MS) return;
    if (jargonInFlightRef.current) return;

    const snapshotEnd = fullTranscriptPlain.length;
    jargonInFlightRef.current = true;
    lastJargonCallAtRef.current = Date.now();
    setJargonLoading(true);

    void (async () => {
      try {
        const { terms } = await extractJargon({
          chunkText: delta,
          alreadyFlagged: jargonTermsRef.current.map((t) => t.term),
          language: language === 'English' ? undefined : language,
        });
        lastJargonScanLenRef.current = snapshotEnd;
        if (terms.length > 0) {
          setJargonTerms((prev) => {
            const seen = new Set(prev.map((t) => t.term.toLowerCase()));
            const now = Date.now();
            const next = [...prev];
            for (const t of terms) {
              const key = t.term.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              next.push({ term: t.term, definition: t.definition, addedAt: now });
            }
            return next;
          });
        }
      } catch {
        /* background scan — no toast */
      } finally {
        jargonInFlightRef.current = false;
        setJargonLoading(false);
      }
    })();
  }, [fullTranscriptPlain, isRecording, isPaused, language]);

  useEffect(() => {
    transcriptCommittedPiecesRef.current = transcriptCommittedPieces;
  }, [transcriptCommittedPieces]);

  useEffect(() => {
    transcriptPartialPieceRef.current = transcriptPartialPiece;
  }, [transcriptPartialPiece]);

  useEffect(
    () => () => {
      cancelAnimationFrame(micMeterRafRef.current);
      micMeterRafRef.current = 0;
    },
    [],
  );

  const attachScriptProcessorPipeline = useCallback((ws: WebSocket, audioContext: AudioContext) => {
    const stream = mediaStreamRef.current;
    if (!stream) return;
    teardownAudioGraph();
    const source = audioContext.createMediaStreamSource(stream);
    mediaSourceRef.current = source;
    /* ScriptProcessor deprecated but supported widely; MVP path before AudioWorklet. */
    const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    scriptProcessorRef.current = processor;
    const mute = audioContext.createGain();
    mute.gain.value = 0;
    muteGainRef.current = mute;

    processor.onaudioprocess = (ev) => {
      if (!transcriptionWsRef.current || transcriptionWsRef.current.readyState !== WebSocket.OPEN) return;
      if (isPausedRef.current) return;
      const inputBuffer = ev.inputBuffer.getChannelData(0);
      const copy = new Float32Array(inputBuffer.length);
      copy.set(inputBuffer);
      const pcm = floatToPCM16(copy, audioContext.sampleRate);
      const target = transcriptionWsRef.current;
      if (target && target.readyState === WebSocket.OPEN) {
        const sliced = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
        target.send(sliced);
      }
    };

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;
    analyser.minDecibels = -85;
    analyser.maxDecibels = -25;
    analyserRef.current = analyser;
    source.connect(analyser);

    source.connect(processor);
    processor.connect(mute);
    mute.connect(audioContext.destination);

    startMicMeterLoop();
  }, [teardownAudioGraph, startMicMeterLoop]);

  const buildAudioGraphAndStreamPCM = useCallback(
    async (ws: WebSocket) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const audioContext =
        audioContextRef.current ??
        new AudioContext({
          latencyHint: 'interactive',
        });
      audioContextRef.current = audioContext;
      await audioContext.resume();

      attachScriptProcessorPipeline(ws, audioContext);
      setSttStatus({ kind: 'live' });
    },
    [attachScriptProcessorPipeline],
  );

  const reloadCourses = useCallback(async () => {
    if (!userRoot) return;
    setLoadingCourses(true);
    try {
      const items = await listItems({ directory: userRoot, sortBy: 'name', sortDir: 'asc' });
      setCourseFolders(items.filter((i) => i.type === 'folder'));
    } catch {
      window.alert('Could not load folders from Home. Create a folder on Home first.');
    } finally {
      setLoadingCourses(false);
    }
  }, [userRoot]);

  const reloadSlideDecks = useCallback(async () => {
    if (!userRoot) return;
    setLoadingDecks(true);
    try {
      const items = await listItems({
        directory: userRoot,
        tree: true,
        sortBy: 'lastEditedDate',
        sortDir: 'desc',
      });
      setAvailableDecks(items.filter((i) => i.type === 'note' && i.noteSourceType === 'slide_pdf'));
    } catch {
      /* deck list is non-critical; user can still upload inline */
    } finally {
      setLoadingDecks(false);
    }
  }, [userRoot]);

  useEffect(() => {
    void reloadCourses();
  }, [reloadCourses]);

  useEffect(() => {
    void reloadSlideDecks();
  }, [reloadSlideDecks]);

  const attachDeck = useCallback(
    async (note: { id: number; title: string }) => {
      setDeckError(null);
      setDeckLoading(true);
      try {
        const [blob, full] = await Promise.all([fetchNotePdfBlob(note.id), getNote(note.id)]);
        const blobUrl = URL.createObjectURL(blob);
        setSlideDeck((prev) => {
          if (prev) URL.revokeObjectURL(prev.pdfBlobUrl);
          return { noteId: note.id, title: note.title, pdfBlobUrl: blobUrl, pageCount: 0 };
        });
        setCurrentSlide(1);
        setSlideConfidence(0);
        setLockedSlide(null);
        setLowConfidenceStreak(0);
        lastSlideScanLenRef.current = 0;
        lastSlideCallAtRef.current = 0;
        slideMatchInFlightRef.current = false;
        toast.success(`Slide sync on — "${note.title}" attached.`);

        const slideChunks = full.rawText.split(/\n*---\s*Slide\s+\d+\s*---\n*/i).filter((s) => s.trim());
        if (slideChunks.length > 0) {
          const totalWords = slideChunks.reduce((sum, chunk) => sum + countWords(chunk), 0);
          const avg = totalWords / slideChunks.length;
          if (avg < 10) {
            toast.warning(
              'Heads up: this deck has very little extractable text per slide — auto-sync may not be reliable.',
              { duration: 6000 },
            );
          }
        }
      } catch (err) {
        setDeckError(err instanceof Error ? err.message : 'Could not load slide deck.');
        toast.error(err instanceof Error ? err.message : 'Could not load slide deck.');
      } finally {
        setDeckLoading(false);
      }
    },
    [],
  );

  const detachDeck = useCallback(() => {
    setSlideDeck((prev) => {
      if (prev) URL.revokeObjectURL(prev.pdfBlobUrl);
      return null;
    });
    setCurrentSlide(1);
    setSlideConfidence(0);
    setLockedSlide(null);
    setLowConfidenceStreak(0);
    setDeckError(null);
  }, []);

  const handleSlidePdfPicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !userRoot) return;
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        toast.error('Please choose a PDF file.');
        return;
      }
      setDeckLoading(true);
      try {
        const targetDirectory =
          saveLocation === 'course' && selectedCourse
            ? joinDirectory(userRoot, selectedCourse)
            : userRoot;
        const note = await uploadSlidePdf(targetDirectory, file);
        await reloadSlideDecks();
        await attachDeck({ id: note.id, title: note.title });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'PDF upload failed.');
      } finally {
        setDeckLoading(false);
      }
    },
    [attachDeck, reloadSlideDecks, saveLocation, selectedCourse, userRoot],
  );

  useEffect(() => {
    return () => {
      if (slideDeck) URL.revokeObjectURL(slideDeck.pdfBlobUrl);
    };
    // Only run on unmount; guarding by `slideDeck` would revoke too early on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isRecording || isPaused) return;
    if (!slideDeck) return;
    if (lockedSlide !== null) return;
    const deltaStart = lastSlideScanLenRef.current;
    const delta = fullTranscriptPlain.slice(deltaStart);
    if (countWords(delta) < SLIDE_SYNC_WORD_THRESHOLD) return;
    if (Date.now() - lastSlideCallAtRef.current < SLIDE_SYNC_CLIENT_COOLDOWN_MS) return;
    if (slideMatchInFlightRef.current) return;

    const recent =
      fullTranscriptPlain.length <= SLIDE_SYNC_TRANSCRIPT_WINDOW
        ? fullTranscriptPlain
        : fullTranscriptPlain.slice(-SLIDE_SYNC_TRANSCRIPT_WINDOW);
    if (!recent.trim()) return;

    const snapshotEnd = fullTranscriptPlain.length;
    const noteId = slideDeck.noteId;
    const currentSlideAtCall = currentSlide;

    slideMatchInFlightRef.current = true;
    lastSlideCallAtRef.current = Date.now();
    setSlideMatchLoading(true);

    void (async () => {
      try {
        const result = await matchCurrentSlide({
          slideNoteId: noteId,
          recentTranscript: recent,
          currentSlide: currentSlideAtCall,
        });
        lastSlideScanLenRef.current = snapshotEnd;
        setSlideConfidence(result.confidence);
        if (result.deckSize > 0) {
          setSlideDeck((prev) =>
            prev && prev.noteId === noteId && prev.pageCount !== result.deckSize
              ? { ...prev, pageCount: result.deckSize }
              : prev,
          );
        }
        if (result.confidence >= SLIDE_SYNC_MIN_CONFIDENCE) {
          setCurrentSlide(result.slideNumber);
          setLowConfidenceStreak(0);
        } else {
          setLowConfidenceStreak((s) => s + 1);
        }
      } catch {
        /* background poll — keep current slide */
      } finally {
        slideMatchInFlightRef.current = false;
        setSlideMatchLoading(false);
      }
    })();
  }, [fullTranscriptPlain, isRecording, isPaused, slideDeck, lockedSlide, currentSlide]);

  const handleSlidePrev = useCallback(() => {
    setCurrentSlide((s) => {
      const next = Math.max(1, s - 1);
      setLockedSlide(next);
      return next;
    });
  }, []);

  const handleSlideNext = useCallback(() => {
    setCurrentSlide((s) => {
      const cap = slideDeck?.pageCount && slideDeck.pageCount > 0 ? slideDeck.pageCount : s + 1;
      const next = Math.min(cap, s + 1);
      setLockedSlide(next);
      return next;
    });
  }, [slideDeck?.pageCount]);

  const handleToggleSlideLock = useCallback(() => {
    setLockedSlide((prev) => {
      if (prev !== null) {
        setLowConfidenceStreak(0);
        return null;
      }
      return currentSlide;
    });
  }, [currentSlide]);

  const handleDeckPageCountKnown = useCallback((count: number) => {
    setSlideDeck((prev) =>
      prev && prev.pageCount !== count ? { ...prev, pageCount: count } : prev,
    );
  }, []);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    if (isRecording) {
      document.title = RECORDING_DOCUMENT_TITLE;
    } else {
      document.title = DEFAULT_DOCUMENT_TITLE;
    }
    return () => {
      document.title = DEFAULT_DOCUMENT_TITLE;
    };
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleNoteChange = (index: number, value: string) => {
    const newNotes = [...notes];
    newNotes[index] = value;
    setNotes(newNotes);
  };

  const handleNoteKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newNotes = [...notes];
      newNotes.splice(index + 1, 0, '');
      setNotes(newNotes);
      setTimeout(() => {
        const inputs = document.querySelectorAll('.note-input');
        (inputs[index + 1] as HTMLInputElement)?.focus();
      }, 0);
      return;
    }
    if (e.key === 'Backspace') {
      if (notes[index] !== '') return;
      if (notes.length === 1) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const newNotes = [...notes];
      newNotes.splice(index, 1);
      setNotes(newNotes);
      const focusAt = Math.max(0, index - 1);
      setTimeout(() => {
        const inputs = document.querySelectorAll('.note-input');
        (inputs[focusAt] as HTMLInputElement)?.focus();
      }, 0);
    }
  };

  const handleSessionQaSubmit = useCallback(async () => {
    const q = sessionQaInput.trim();
    if (!q) return;
    if (!isRecording) {
      toast.error('Start recording first.');
      return;
    }
    if (isPaused) {
      toast.error('Resume recording to ask a question.');
      return;
    }
    if (!transcriptForSessionQa) {
      toast.error('Wait until there is transcript text from the lecture.');
      return;
    }
    setSessionQaLoading(true);
    try {
      const { answer } = await sessionQaAsk({
        transcript: transcriptForSessionQa,
        question: q,
        language: language === 'English' ? undefined : language,
      });
      setSessionQaMessages((prev) => [...prev, { role: 'user', text: q }, { role: 'assistant', text: answer }]);
      setSessionQaInput('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not get an answer.');
    } finally {
      setSessionQaLoading(false);
    }
  }, [sessionQaInput, isRecording, isPaused, transcriptForSessionQa, language]);

  const handleStartRecording = async () => {
    if (saveLocation === 'course' && !selectedCourse) {
      window.alert('Please select or create a course folder first.');
      return;
    }

    const token = getToken();
    if (!token) {
      window.alert('Your session expired. Please log in again.');
      return;
    }

    setTranscriptCommittedPieces([]);
    setTranscriptPartialPiece(null);
    transcriptCommittedPiecesRef.current = [];
    transcriptPartialPieceRef.current = null;
    setSessionQaMessages([]);
    setSessionQaInput('');
    setJargonTerms([]);
    setJargonLoading(false);
    setExpandedJargonKey(null);
    lastJargonScanLenRef.current = 0;
    lastJargonCallAtRef.current = 0;
    jargonInFlightRef.current = false;
    setSttStatus({ kind: 'connecting' });
    setElapsedTime(0);
    setIsRecording(true);
    setIsPaused(false);
    isPausedRef.current = false;

    closeTranscriptionWs();
    teardownAudioGraph();
    stopMediaTracks();

    try {
      const wsUrl = getTranscriptionStreamUrl(token);
      const ws = new WebSocket(wsUrl);
      transcriptionWsRef.current = ws;

      ws.onopen = async () => {
        try {
          ws.send(buildConfigureMessage(language));
          await buildAudioGraphAndStreamPCM(ws);
        } catch (err) {
          setSttStatus({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Microphone unavailable.',
          });
          window.alert(err instanceof Error ? err.message : 'Microphone unavailable.');
          closeTranscriptionWs();
          teardownAudioGraph();
          stopMediaTracks();
          setIsRecording(false);
        }
      };

      ws.onmessage = (evt) => {
        try {
          const raw = typeof evt.data === 'string' ? evt.data : '';
          const parsed = JSON.parse(raw) as TranscriptInbound;
          if (parsed.type === 'error') {
            setSttStatus({ kind: 'error', message: parsed.message ?? 'Transcription error' });
            return;
          }
          if (parsed.type === 'partial') {
            const piece = inboundToPiece(parsed);
            transcriptPartialPieceRef.current = piece;
            setTranscriptPartialPiece(piece);
            return;
          }
          if (parsed.type === 'final') {
            const piece = inboundToPiece(parsed);
            if (piece) {
              setTranscriptCommittedPieces((prev) => {
                const next = [...prev, piece];
                transcriptCommittedPiecesRef.current = next;
                return next;
              });
            }
            transcriptPartialPieceRef.current = null;
            setTranscriptPartialPiece(null);
          }
        } catch {
          /* ignored */
        }
      };

      ws.onerror = () => {
        setSttStatus({ kind: 'error', message: 'WebSocket error' });
      };

      ws.onclose = () => {
        if (transcriptionWsRef.current === ws) transcriptionWsRef.current = null;
      };
    } catch (err) {
      setIsRecording(false);
      setSttStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not connect to transcription',
      });
    }
  };

  const rebuildLiveAudioGraphAfterResume = useCallback(async () => {
    const ws = transcriptionWsRef.current;
    const stream = mediaStreamRef.current;
    const audioContext = audioContextRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !stream || !audioContext) return;
    await audioContext.resume();
    attachScriptProcessorPipeline(ws, audioContext);
  }, [attachScriptProcessorPipeline]);

  const handlePauseRecording = async () => {
    if (!isRecording) return;
    const next = !isPaused;
    setIsPaused(next);
    isPausedRef.current = next;
    if (next) {
      teardownAudioGraph();
      try {
        await audioContextRef.current?.suspend();
      } catch {
        /* noop */
      }
    } else {
      await rebuildLiveAudioGraphAfterResume();
    }
  };

  const handleStopRecording = async () => {
    if (!userRoot) return;
    if (saveLocation === 'course' && !selectedCourse) {
      window.alert('Please select a course folder.');
      return;
    }

    setIsRecording(false);
    isPausedRef.current = false;
    closeTranscriptionWs();
    teardownAudioGraph();
    try {
      await audioContextRef.current?.close();
    } catch {
      /* noop */
    }
    audioContextRef.current = null;
    stopMediaTracks();

    const cleanedNotes = notes
      .map((note) => note.trim())
      .filter(Boolean)
      .map((note) => `- ${note}`)
      .join('\n');

    const directory =
      saveLocation === 'course' ? joinDirectory(userRoot, selectedCourse) : userRoot;

    const rawText = [
      `Lecture: ${lectureName}`,
      `Course Folder: ${saveLocation === 'course' ? selectedCourse : '(Home root)'}`,
      `Language: ${language}`,
      '',
      'Notes:',
      cleanedNotes || '- No notes were captured.',
      '',
      'Transcript:',
      (() => {
        const merged = piecesPlainText(
          transcriptCommittedPiecesRef.current,
          transcriptPartialPieceRef.current,
        );
        return merged || fullTranscriptPlain || 'No transcript captured yet.';
      })(),
    ].join('\n');

    try {
      const saved = await createNote({
        title: lectureName.trim(),
        directory,
        rawText,
        language,
        durationSeconds: elapsedTime,
      });
      try {
        const transcriptOnly = extractTranscriptSection(rawText);
        const mentions = extractImportantDatesFromTranscript(transcriptOnly, new Date());
        const added = appendImportantEventsFromRecording(saved.id, saved.title, mentions);
        queueImportantAlertsForHome(added);
      } catch {
        /* best-effort: still go home if local storage or parsing fails */
      }
      navigate('/home');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to save recording');
      setIsRecording(false);
    }
  };

  useEffect(() => {
    return () => {
      closeTranscriptionWs();
      teardownAudioGraph();
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      stopMediaTracks();
    };
  }, []);

  const handleCreateCourse = async () => {
    const name = newCourseName.trim();
    if (!name || !userRoot) return;
    try {
      await createFolder(name, userRoot);
      await reloadCourses();
      setSaveLocation('course');
      setSelectedCourse(name);
      setShowCourseModal(false);
      setNewCourseName('');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to create course folder');
    }
  };

  if (!sessionUser || userId === null || !userRoot) {
    return <Navigate to="/" replace />;
  }

  const firstName = firstNameFromDisplayName(sessionUser.name);
  const dayGreet = timeOfDayGreeting();
  const profileInitials = userInitials(sessionUser.name, sessionUser.username);

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div
          className="brand-ambient-blob-a absolute -left-[20%] top-[-15%] h-[min(50vmin,22rem)] w-[min(50vmin,22rem)] rounded-full bg-[var(--brand)] opacity-[0.08] blur-[3.5rem]"
          style={{ animationDelay: '-2s' }}
        />
        <div
          className="brand-ambient-blob-b absolute -right-[10%] bottom-[10%] h-[min(45vmin,20rem)] w-[min(45vmin,20rem)] rounded-full bg-[var(--brand-deep)] opacity-[0.07] blur-[3rem]"
          style={{ animationDelay: '-5s' }}
        />
        <div
          className="brand-ambient-blob-c absolute left-[30%] top-[35%] h-[min(38vmin,16rem)] w-[min(38vmin,16rem)] rounded-full bg-[var(--brand)] opacity-[0.06] blur-[3.5rem]"
          style={{ animationDelay: '-1s' }}
        />
        <PageAmbientDecor />
      </div>

      <div className="relative z-10 flex w-80 shrink-0 flex-col border-r border-border bg-card/95 p-6 backdrop-blur-sm dark:bg-card/90">
        <button
          type="button"
          onClick={() => navigate('/home')}
          aria-label="Classroom Companion — go to home"
          className="group mb-8 flex w-full items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-muted/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <img
            src={cornerLogo}
            alt=""
            width={44}
            height={44}
            draggable={false}
            className="pointer-events-none h-11 w-11 shrink-0 select-none rounded-lg shadow-sm ring-1 ring-border/70"
          />
          <div className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold tracking-tight text-foreground">Classroom Companion</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">Home</span>
          </div>
        </button>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mb-5 rounded-xl border border-border bg-gradient-to-br from-[var(--brand-soft-bg)] to-transparent p-3"
        >
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              {profileInitials}
            </div>
            <div className="min-w-0">
              <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">{dayGreet}</p>
              <p className="truncate text-sm font-medium text-foreground">This session is yours, {firstName}</p>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Choose save location & language, then capture your notes and live transcript in one place.
          </p>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: reduceMotion ? 0 : 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="mb-6 space-y-2 rounded-xl border border-dashed border-[var(--brand-soft-border)] bg-muted/20 px-3 py-3 text-xs"
        >
          <p className="font-medium text-foreground">Lecture snapshot</p>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mic className="size-3.5 shrink-0 text-[var(--brand)]" aria-hidden />
            <span className="truncate font-medium text-foreground">{lectureName || 'Untitled lecture'}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Languages className="size-3.5 shrink-0 text-[var(--brand)]" aria-hidden />
            <span>{language}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <FolderOpen className="size-3.5 shrink-0 text-[var(--brand)]" aria-hidden />
            <span className="truncate">
              {saveLocation === 'home' ? 'Home' : selectedCourse || 'Choose a folder'}
            </span>
          </div>
        </motion.div>

        <div className="flex-1 space-y-6">
          <div>
            <label className="block text-sm mb-2 text-muted-foreground">Lecture Name</label>
            <input
              type="text"
              value={lectureName}
              onChange={(e) => setLectureName(e.target.value)}
              disabled={isRecording}
              className="w-full px-3 py-2 border border-border bg-input-background rounded-lg focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">Save recording to</label>
            <p className="mt-0.5 mb-2 text-xs text-muted-foreground leading-snug">
              Your Home library or a course folder — one place to choose.
            </p>
            <select
              value={
                saveLocation === 'home'
                  ? SAVE_TO_HOME_VALUE
                  : selectedCourse || SAVE_TO_HOME_VALUE
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'create-new') {
                  setShowCourseModal(true);
                  return;
                }
                if (v === SAVE_TO_HOME_VALUE) {
                  setSaveLocation('home');
                  return;
                }
                setSaveLocation('course');
                setSelectedCourse(v);
              }}
              disabled={isRecording || loadingCourses}
              className="w-full px-3 py-2.5 border border-border bg-input-background rounded-lg focus:outline-none focus:ring-2 text-[15px]"
              style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
            >
              <optgroup label="Library">
                <option value={SAVE_TO_HOME_VALUE}>Home</option>
              </optgroup>
              <optgroup label={loadingCourses ? 'Folders (loading…)' : 'Course folders'}>
                {courseFolders.map((folder) => (
                  <option key={folder.id} value={folder.name}>
                    {folder.name}
                  </option>
                ))}
              </optgroup>
              <option value="create-new">+ Create new course folder…</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-2 text-muted-foreground">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isRecording}
              className="w-full px-3 py-2 border border-border bg-input-background rounded-lg focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
            >
              <option>English</option>
              <option>Spanish</option>
              <option>French</option>
              <option>German</option>
              <option>Mandarin</option>
            </select>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Presentation className="size-3.5 shrink-0 text-[var(--brand)]" aria-hidden />
                Slide deck
              </label>
              {slideDeck ? (
                <button
                  type="button"
                  onClick={detachDeck}
                  className="text-[0.7rem] font-medium text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <p className="mb-2 text-xs leading-snug text-muted-foreground">
              Optional: pin the slide the lecturer is on. AI follows along from the live transcript.
            </p>
            <select
              value={slideDeck?.noteId ? String(slideDeck.noteId) : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__upload__') {
                  slidePdfInputRef.current?.click();
                  return;
                }
                if (!v) {
                  detachDeck();
                  return;
                }
                const id = Number.parseInt(v, 10);
                const found = availableDecks.find((d) => d.id === id);
                if (found) void attachDeck({ id: found.id, title: found.name });
              }}
              disabled={deckLoading}
              className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-60"
              style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
            >
              <option value="">{loadingDecks ? 'Loading decks…' : 'No deck — skip slide sync'}</option>
              {availableDecks.length > 0 ? (
                <optgroup label="Your slide decks">
                  {availableDecks.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <option value="__upload__">+ Upload a PDF…</option>
            </select>
            <input
              ref={slidePdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => void handleSlidePdfPicked(e)}
            />
            {deckLoading ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Preparing deck…
              </p>
            ) : null}
            {deckError ? (
              <p className="mt-2 text-xs text-destructive">{deckError}</p>
            ) : null}
            {slideDeck && !deckLoading ? (
              <button
                type="button"
                onClick={() => slidePdfInputRef.current?.click()}
                className="mt-2 inline-flex items-center gap-1 text-[0.7rem] font-medium text-muted-foreground hover:text-foreground"
              >
                <Upload className="size-3" aria-hidden /> Replace with another PDF
              </button>
            ) : null}
          </div>

        </div>

        <button
          onClick={() => navigate('/home')}
          className="mt-auto w-full py-2 border border-border rounded-lg hover:bg-accent hover:text-accent-foreground"
        >
          Home
        </button>
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border bg-card/95 p-6 backdrop-blur-sm dark:bg-card/90">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Side notes</p>
              <h2 className="text-xl font-semibold tracking-tight">Jot while you listen, {firstName}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">Quick bullets — your transcript builds below.</p>
            </div>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {notes.map((note, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="mt-2">•</span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => handleNoteChange(index, e.target.value)}
                  onKeyDown={(e) => handleNoteKeyDown(index, e)}
                  className="note-input flex-1 px-3 py-1 border-b border-border bg-transparent focus:outline-none focus:border-b-2 focus:[border-bottom-color:var(--brand)]"
                  placeholder="Type a note..."
                />
              </div>
            ))}
          </div>
        </div>

        {isRecording ? (
          <div className="relative z-20 shrink-0 border-b border-[var(--brand-soft-border)] bg-gradient-to-b from-[var(--brand-soft-bg)]/60 via-card/98 to-card/95 px-4 py-3 backdrop-blur-md dark:from-[var(--brand-soft-bg)]/30">
            <div className="mx-auto max-w-4xl">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-md ring-2 ring-[var(--brand)]/30"
                    style={{
                      background:
                        'linear-gradient(145deg, var(--brand-soft-bg), color-mix(in srgb, var(--brand) 18%, transparent))',
                    }}
                  >
                    <Mic className="size-[1.15rem] text-[var(--brand-deep)] dark:text-[var(--brand)]" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Live input
                    </p>
                    <p className="truncate text-sm font-medium text-foreground">
                      {isPaused ? 'Paused — meter idle' : 'Speech energy'}
                    </p>
                  </div>
                </div>
                {!isPaused ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[0.65rem] font-medium text-emerald-800 dark:text-emerald-400">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-50" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    Listening
                  </span>
                ) : (
                  <span className="text-[0.65rem] font-medium text-muted-foreground">Resume for live levels</span>
                )}
              </div>
              <div
                className="flex h-[3.25rem] items-end justify-center gap-px rounded-xl border border-border/70 bg-gradient-to-b from-background/90 to-muted/40 px-2 py-2 shadow-inner sm:h-16 sm:gap-0.5"
                role="img"
                aria-label={isPaused ? 'Microphone level idle while paused' : 'Microphone level spectrum'}
              >
                {micSpectrum.map((v, i) => (
                  <div
                    key={i}
                    className="min-h-[4px] min-w-0 flex-1 rounded-full transition-[height,opacity] duration-75 ease-out"
                    style={{
                      height: `${Math.max(12, 12 + v * 88)}%`,
                      background:
                        v > 0.55
                          ? 'linear-gradient(to top, rgb(22 163 74), var(--brand), color-mix(in srgb, var(--brand-hover) 85%, white))'
                          : 'linear-gradient(to top, var(--brand-deep), var(--brand))',
                      opacity: isPaused ? 0.22 : 0.28 + v * 0.72,
                      boxShadow:
                        !isPaused && v > 0.45
                          ? '0 0 10px color-mix(in srgb, var(--brand) 45%, transparent)'
                          : undefined,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl space-y-4">
            {slideDeck ? (
              <RecordingSlidePanel
                deckTitle={slideDeck.title}
                pdfBlobUrl={slideDeck.pdfBlobUrl}
                currentSlide={currentSlide}
                confidence={slideConfidence}
                isLocked={lockedSlide !== null}
                isLoading={slideMatchLoading}
                driftHint={lowConfidenceStreak >= SLIDE_SYNC_DRIFT_THRESHOLD}
                onPageCountKnown={handleDeckPageCountKnown}
                onPrev={handleSlidePrev}
                onNext={handleSlideNext}
                onToggleLock={handleToggleSlideLock}
                onDetach={detachDeck}
              />
            ) : null}
            <div className="min-h-96 rounded-xl border border-border bg-card/95 p-6 shadow-sm backdrop-blur-sm dark:bg-card/90">
              <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 shrink-0 text-[var(--brand)]" aria-hidden />
                <span>Live transcript for this room</span>
              </div>
              {sttStatus.kind === 'error' ? (
                <p className="mb-2 text-sm text-destructive">
                  Transcription issue: {sttStatus.message ?? 'Unknown error'}. You can still finish and save notes.
                </p>
              ) : null}
              {!fullTranscriptPlain ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-foreground">Ready when you are, {firstName}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    When you&apos;re settled, tap <span className="font-medium text-[var(--brand-deep)] dark:text-[var(--brand)]">Start Recording</span> — words will stream here as you teach.
                  </p>
                </div>
              ) : (
                <TranscriptConfidenceText
                  committed={transcriptCommittedPieces}
                  partial={transcriptPartialPiece}
                />
              )}
            </div>

            <div className="rounded-xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur-sm dark:bg-card/90">
              <button
                type="button"
                onClick={() => setJargonOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 rounded-lg text-left transition-colors hover:bg-muted/40"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-foreground">
                  <BookText className="size-4 shrink-0 text-[var(--brand)]" aria-hidden />
                  Live glossary
                  {jargonTerms.length > 0 ? (
                    <span className="ml-1 shrink-0 rounded-full bg-[var(--brand-soft-bg)] px-2 py-0.5 text-[0.65rem] font-medium text-[var(--brand-deep)] dark:text-[var(--brand)]">
                      {jargonTerms.length} term{jargonTerms.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                  {jargonLoading ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                  ) : null}
                </span>
                {jargonOpen ? (
                  <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </button>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Domain jargon from the live transcript appears as chips with one-line definitions. In-memory only —
                clears when you start a new recording. Scans about every {JARGON_CLIENT_COOLDOWN_MS / 1000}s when at
                least {JARGON_SCAN_WORD_THRESHOLD} new words arrive.
              </p>

              {jargonOpen ? (
                <div className="mt-3">
                  {!isRecording ? (
                    <p className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
                      Start recording to see terms appear here as you speak.
                    </p>
                  ) : isPaused ? (
                    <p className="rounded-lg border border-border/80 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
                      Resume recording for live glossary scans.
                    </p>
                  ) : jargonTerms.length === 0 && !jargonLoading ? (
                    <p className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
                      Jargon will appear here as the lecture progresses.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <AnimatePresence mode="popLayout">
                      {jargonTerms.map((item) => {
                        const key = `${item.term}::${item.addedAt}`;
                        const expanded = expandedJargonKey === key;
                        return (
                          <motion.div
                            key={key}
                            layout
                            initial={reduceMotion ? false : { opacity: 0, x: 14 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={reduceMotion ? undefined : { opacity: 0, x: -10 }}
                            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                            className="min-w-0 max-w-full"
                          >
                            <button
                              type="button"
                              onClick={() => setExpandedJargonKey((k) => (k === key ? null : key))}
                              className={
                                expanded
                                  ? 'w-full max-w-full rounded-xl border border-[var(--brand)]/40 bg-[var(--brand-soft-bg)] px-3 py-2 text-left shadow-sm transition-colors'
                                  : 'max-w-full rounded-full border border-border bg-background/95 px-3 py-1.5 text-left text-sm font-medium text-foreground shadow-sm transition-colors hover:border-[var(--brand)]/45 hover:bg-muted/40'
                              }
                            >
                              <span className="block truncate">{item.term}</span>
                              {expanded ? (
                                <span className="mt-1.5 block text-xs font-normal leading-snug text-muted-foreground">
                                  {item.definition}
                                </span>
                              ) : null}
                            </button>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur-sm dark:bg-card/90">
              <button
                type="button"
                onClick={() => setSessionQaOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 rounded-lg text-left transition-colors hover:bg-muted/40"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <MessageCircleQuestion className="size-4 shrink-0 text-[var(--brand)]" aria-hidden />
                  Session Q&amp;A
                </span>
                {sessionQaOpen ? (
                  <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </button>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Your AI TA uses only this session&apos;s transcript (last ~{SESSION_QA_CHAR_WINDOW.toLocaleString()}{' '}
                characters). One question every ~12 seconds.
              </p>

              {sessionQaOpen ? (
                <>
                  <div className="mt-3 max-h-52 overflow-y-auto space-y-2 rounded-lg border border-border/80 bg-muted/20 p-2">
                    {sessionQaMessages.length === 0 ? (
                      <div className="space-y-3 px-1 py-2">
                        <p className="text-xs text-muted-foreground">
                          Ask anything covered in the audio so far — answers stay grounded in the transcript.
                        </p>
                        <div>
                          <p className="mb-1.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                            Try asking
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {SESSION_QA_SUGGESTED_PROMPTS.map((prompt) => (
                              <button
                                key={prompt}
                                type="button"
                                className="rounded-full border border-border bg-background/90 px-2.5 py-1 text-left text-[0.7rem] leading-snug text-foreground shadow-sm transition-colors hover:border-[var(--brand)]/50 hover:bg-[var(--brand-soft-bg)] disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={!isRecording || isPaused || sessionQaLoading}
                                title={
                                  !isRecording
                                    ? 'Start recording first'
                                    : isPaused
                                      ? 'Resume recording to use suggestions'
                                      : undefined
                                }
                                onClick={() => setSessionQaInput(prompt)}
                              >
                                {prompt}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      sessionQaMessages.map((m, i) => (
                        <div
                          key={`${m.role}-${i}`}
                          className={
                            m.role === 'user'
                              ? 'ml-4 rounded-lg bg-[var(--brand-soft-bg)] px-3 py-2 text-sm text-foreground'
                              : 'mr-4 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground'
                          }
                        >
                          {m.role === 'assistant' ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-2 [&_p:last-child]:mb-0">
                              <MarkdownPreview markdown={m.text} />
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{m.text}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <textarea
                      value={sessionQaInput}
                      onChange={(e) => setSessionQaInput(e.target.value)}
                      placeholder={
                        isRecording && !isPaused
                          ? 'e.g. What’s the definition they gave for…?'
                          : 'Start recording to ask…'
                      }
                      disabled={!isRecording || isPaused || sessionQaLoading}
                      rows={2}
                      className="min-h-[3rem] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-60"
                      style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleSessionQaSubmit();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleSessionQaSubmit()}
                      disabled={
                        sessionQaLoading || !isRecording || isPaused || !sessionQaInput.trim() || !transcriptForSessionQa
                      }
                      className="shrink-0 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                      style={{ backgroundColor: 'var(--brand)' }}
                    >
                      {sessionQaLoading ? 'Thinking…' : 'Ask'}
                    </button>
                  </div>
                  {isRecording && !isPaused && !transcriptForSessionQa ? (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">Waiting for transcript…</p>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="border-t border-border bg-card/95 backdrop-blur-sm dark:bg-card/90">
          {isRecording ? (
            <div
              role="status"
              aria-live="polite"
              className={
                sttStatus.kind === 'error'
                  ? 'flex items-center gap-2 border-b border-destructive/35 bg-destructive/10 px-4 py-2.5 text-sm text-destructive'
                  : isPaused
                    ? 'flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-950 dark:text-amber-100'
                    : sttStatus.kind === 'connecting'
                      ? 'flex items-center gap-2 border-b border-amber-500/35 bg-amber-500/[0.12] px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200'
                      : 'flex items-center gap-2 border-b border-emerald-500/30 bg-emerald-500/[0.1] px-4 py-2.5 text-sm text-emerald-950 dark:text-emerald-100'
              }
            >
              {sttStatus.kind === 'error' ? (
                <>
                  <span className="font-semibold">Transcription</span>
                  <span className="min-w-0">
                    {sttStatus.message ?? 'Connection issue'} — you can still save notes when you finish.
                  </span>
                </>
              ) : isPaused ? (
                <>
                  <span className="relative flex h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
                  <span>
                    <span className="font-semibold">Paused</span>
                    <span className="text-muted-foreground"> — microphone and transcription are idle</span>
                  </span>
                </>
              ) : sttStatus.kind === 'connecting' ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin text-amber-600 dark:text-amber-400" aria-hidden />
                  <span>
                    <span className="font-semibold">Connecting</span>
                    <span className="text-muted-foreground">
                      {' '}
                      — turning on your mic and linking to the transcription service…
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-40" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <span>
                    <span className="font-semibold text-emerald-800 dark:text-emerald-300">Live pipeline</span>
                    <span className="text-muted-foreground">
                      {' '}
                      — audio streaming; transcript updates below as you speak
                    </span>
                  </span>
                </>
              )}
            </div>
          ) : null}
          <div className="mx-auto flex max-w-4xl items-center justify-center gap-4 p-6">
            {!isRecording ? (
              <button
                type="button"
                onClick={() => void handleStartRecording()}
                className="px-8 py-3 text-white rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--brand)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand)')}
              >
                Start Recording
              </button>
            ) : (
              <>
                <button
                  onClick={handlePauseRecording}
                  className="px-6 py-3 bg-secondary text-secondary-foreground rounded-lg hover:opacity-90"
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  onClick={() => void handleStopRecording()}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Finish & Exit
                </button>
                <div className="ml-4 text-xl">{formatTime(elapsedTime)}</div>
              </>
            )}
          </div>
        </div>
      </div>

      {showCourseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-96">
            <h3 className="text-xl mb-4">Create New Course Folder</h3>
            <input
              type="text"
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              placeholder="Course name"
              className="w-full px-3 py-2 border border-border bg-input-background rounded-lg mb-4 focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => void handleCreateCourse()}
                className="flex-1 px-4 py-2 text-white rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--brand)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand)')}
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCourseModal(false);
                  setNewCourseName('');
                }}
                className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
