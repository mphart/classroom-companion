import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import logo from '@/imports/classroomcompanion_logo_v4.svg';
import { createFolder, createNote, listItems, type ListedItemDto } from '@/app/lib/api';
import { getSessionUser } from '@/app/lib/authSession';
import { joinDirectory, userRootDirectory } from '@/app/lib/pathUtils';
import { ThemeToggle } from '@/app/components/ThemeToggle';

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
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [saveLocation, setSaveLocation] = useState<'home' | 'course'>('home');
  const [loadingCourses, setLoadingCourses] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

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

  const handleStartRecording = () => {
    if (saveLocation === 'course' && !selectedCourse) {
      window.alert('Please select or create a course folder first.');
      return;
    }
    setTranscript('');
    setElapsedTime(0);
    setIsRecording(true);
    setIsPaused(false);
  };

  const handlePauseRecording = () => {
    setIsPaused(!isPaused);
  };

  const handleStopRecording = async () => {
    if (!userRoot) return;
    if (saveLocation === 'course' && !selectedCourse) {
      window.alert('Please select or create a course folder.');
      return;
    }

    setIsRecording(false);

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
      transcript.trim() || '(no transcript — open this note later or use Generate AI Summary on multiple notes)',
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
            <h2 className="text-xl">Quick notes</h2>
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
          <div className="max-w-4xl mx-auto space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="lecture-transcript" className="text-sm font-medium text-foreground">
                Transcript & lecture capture
              </label>
              {isRecording ? (
                <span className="text-xs text-muted-foreground">{isPaused ? 'Paused' : 'Session running'}</span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              There is no mock transcript — type live, paste from captions, or leave blank and capture text from your
              notes only. Saved content is sent to your library and can be summarized with Gemini from Home (Select +
              Generate).
            </p>
            <textarea
              id="lecture-transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              spellCheck
              placeholder="Type lecture content here, paste slide text, paste automated captions …"
              className="w-full min-h-[280px] rounded-lg border border-border bg-input-background p-4 text-sm leading-relaxed focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
            />
          </div>
        </div>

        <div className="bg-card border-t border-border p-6">
          <div className="max-w-4xl mx-auto flex items-center justify-center gap-4">
            {!isRecording ? (
              <button
                onClick={() => handleStartRecording()}
                className="px-8 py-3 text-white rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--brand)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand)')}
              >
                Start Session
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
