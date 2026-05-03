import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import logo from '@/imports/classroomcompanion_logo_v4.svg';
import { createFolder, createNote, listItems, type ListedItemDto } from '@/app/lib/api';
import { floatToPCM16 } from '@/app/lib/audioPcm16k';
import { getSessionUser, getToken } from '@/app/lib/authSession';
import { joinDirectory, userRootDirectory } from '@/app/lib/pathUtils';
import { buildConfigureMessage, getTranscriptionStreamUrl } from '@/app/lib/transcriptionWs';
import {
  piecesPlainText,
  TranscriptConfidenceText,
  type TranscriptRichPiece,
  type TranscriptToken,
} from '@/app/components/TranscriptConfidenceText';
import { ThemeToggle } from '@/app/components/ThemeToggle';

const BUFFER_SIZE = 4096;

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

function inboundToPiece(parsed: TranscriptInbound): TranscriptRichPiece | null {
  const text = typeof parsed.text === 'string' ? parsed.text : '';
  if (!text.trim()) return null;
  const words = parseInboundWords(parsed.words);
  return { text, ...(words ? { words } : {}) };
}

export function ActiveRecording() {
  const navigate = useNavigate();
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

  const transcriptionWsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);

  const isPausedRef = useRef(false);
  const transcriptCommittedPiecesRef = useRef<TranscriptRichPiece[]>([]);
  const transcriptPartialPieceRef = useRef<TranscriptRichPiece | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  const teardownAudioGraph = useCallback(() => {
    try {
      scriptProcessorRef.current?.disconnect();
      mediaSourceRef.current?.disconnect();
      muteGainRef.current?.disconnect();
    } catch {
      /* noop */
    }
    scriptProcessorRef.current = null;
    mediaSourceRef.current = null;
    muteGainRef.current = null;
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

  useEffect(() => {
    transcriptCommittedPiecesRef.current = transcriptCommittedPieces;
  }, [transcriptCommittedPieces]);

  useEffect(() => {
    transcriptPartialPieceRef.current = transcriptPartialPiece;
  }, [transcriptPartialPiece]);

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

    source.connect(processor);
    processor.connect(mute);
    mute.connect(audioContext.destination);
  }, [teardownAudioGraph]);

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

  useEffect(() => {
    void reloadCourses();
  }, [reloadCourses]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

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
    }
  };

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
      await createNote({
        title: lectureName.trim(),
        directory,
        rawText,
        language,
        durationSeconds: elapsedTime,
      });
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

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <div className="w-80 bg-card border-r border-border p-6 flex flex-col">
        <button onClick={() => navigate('/home')} className="mb-8">
          <img src={logo} alt="ClassroomCompanion" className="h-16 w-full object-contain" />
        </button>

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
            <label className="block text-sm mb-2 text-muted-foreground">Course</label>
            <select
              value={selectedCourse}
              onChange={(e) => {
                if (e.target.value === 'create-new') {
                  setShowCourseModal(true);
                } else {
                  setSelectedCourse(e.target.value);
                }
              }}
              disabled={isRecording || loadingCourses}
              className="w-full px-3 py-2 border border-border bg-input-background rounded-lg focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
            >
              <option value="">{loadingCourses ? 'Loading folders…' : 'Select a course folder'}</option>
              {courseFolders.map((folder) => (
                <option key={folder.id} value={folder.name}>
                  {folder.name}
                </option>
              ))}
              <option value="create-new">+ Create New Course</option>
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
            {language !== 'English' ? (
              <p className="mt-1.5 text-xs text-muted-foreground leading-snug">
                Speech is translated into {language} on the server (Gladia). The API needs{' '}
                <span className="font-mono text-[11px]">GLADIO_API_KEY</span> configured. English uses Deepgram only.
              </p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm mb-2 text-muted-foreground">Save Recording Output</label>
            <select
              value={saveLocation}
              onChange={(e) => setSaveLocation(e.target.value as 'home' | 'course')}
              disabled={isRecording}
              className="w-full px-3 py-2 border border-border bg-input-background rounded-lg focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
            >
              <option value="home">Home root directory</option>
              <option value="course">Inside selected course folder</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => navigate('/home')}
          className="mt-auto w-full py-2 border border-border rounded-lg hover:bg-accent hover:text-accent-foreground"
        >
          Home
        </button>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="bg-card border-b border-border p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl">Enter Notes</h2>
            <ThemeToggle />
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

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            <div className="bg-card rounded-lg shadow-sm border border-border p-6 min-h-96">
              {sttStatus.kind !== 'idle' && sttStatus.kind !== 'live' ? (
                <p className="text-sm text-amber-600 dark:text-amber-500 mb-2">
                  {sttStatus.kind === 'connecting' && 'Connecting to transcription…'}
                  {sttStatus.kind === 'error' &&
                    `Transcription issue: ${sttStatus.message ?? 'Unknown error'}. You can still finish and save notes.`}
                </p>
              ) : null}
              {!fullTranscriptPlain ? (
                <p className="text-muted-foreground">Click Start to begin recording...</p>
              ) : (
                <TranscriptConfidenceText
                  committed={transcriptCommittedPieces}
                  partial={transcriptPartialPiece}
                />
              )}
            </div>
          </div>
        </div>

        <div className="bg-card border-t border-border p-6">
          <div className="max-w-4xl mx-auto flex items-center justify-center gap-4">
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
