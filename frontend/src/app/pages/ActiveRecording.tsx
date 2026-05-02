import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import logo from '@/imports/classroomcompanion_logo_v4.svg';
import { ThemeToggle } from '@/app/components/ThemeToggle';

export function ActiveRecording() {
  const navigate = useNavigate();
  const [lectureName, setLectureName] = useState(() => {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `Lecture-${month}-${day}`;
  });
  const [selectedCourse, setSelectedCourse] = useState('');
  const [language, setLanguage] = useState('English');
  const [notes, setNotes] = useState<string[]>(['']);
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');

  const courses = ['Physics', 'Mathematics', 'Chemistry', 'Biology'];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

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
    if (!selectedCourse) {
      alert('Please select a course first');
      return;
    }
    setIsRecording(true);
    setIsPaused(false);
    simulateTranscription();
  };

  const handlePauseRecording = () => {
    setIsPaused(!isPaused);
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    navigate('/viewer');
  };

  const simulateTranscription = () => {
    const sampleTexts = [
      'Today we will be discussing quantum mechanics and wave-particle duality.',
      'The Schrödinger equation is fundamental to understanding quantum systems.',
      'Remember that observation affects the state of quantum particles.',
      'This concept will be on the midterm exam.',
    ];

    let index = 0;
    const interval = setInterval(() => {
      if (!isRecording || isPaused) {
        clearInterval(interval);
        return;
      }

      setTranscript((prev) => {
        if (index < sampleTexts.length) {
          index++;
          return prev + (prev ? ' ' : '') + sampleTexts[index - 1];
        }
        return prev;
      });
    }, 3000);
  };

  const handleCreateCourse = () => {
    if (newCourseName.trim()) {
      setSelectedCourse(newCourseName);
      setShowCourseModal(false);
      setNewCourseName('');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <div className="w-80 bg-card border-r border-border p-6 flex flex-col">
        <button
          onClick={() => navigate('/home')}
          className="mb-8"
        >
          <img
            src={logo}
            alt="ClassroomCompanion"
            className="h-16 w-full object-contain"
          />
        </button>

        <div className="flex-1 space-y-6">
          <div>
            <label className="block text-sm mb-2 text-muted-foreground">
              Lecture Name
            </label>
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
            <label className="block text-sm mb-2 text-muted-foreground">
              Course
            </label>
            <select
              value={selectedCourse}
              onChange={(e) => {
                if (e.target.value === 'create-new') {
                  setShowCourseModal(true);
                } else {
                  setSelectedCourse(e.target.value);
                }
              }}
              disabled={isRecording}
              className="w-full px-3 py-2 border border-border bg-input-background rounded-lg focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
            >
              <option value="">Select a course</option>
              {courses.map((course) => (
                <option key={course} value={course}>
                  {course}
                </option>
              ))}
              <option value="create-new">+ Create New Course</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-2 text-muted-foreground">
              Language
            </label>
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
              {transcript || (
                <p className="text-muted-foreground">
                  Click Start to begin recording...
                </p>
              )}
              {transcript && <p className="whitespace-pre-wrap">{transcript}</p>}
            </div>
          </div>
        </div>

        <div className="bg-card border-t border-border p-6">
          <div className="max-w-4xl mx-auto flex items-center justify-center gap-4">
            {!isRecording ? (
              <button
                onClick={handleStartRecording}
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
                  onClick={handleStopRecording}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Stop
                </button>
                <div className="ml-4 text-xl">
                  {formatTime(elapsedTime)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showCourseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-96">
            <h3 className="text-xl mb-4">Create New Course</h3>
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
                onClick={handleCreateCourse}
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
