import type { ExtractedImportantMention } from '@/app/lib/extractImportantDatesFromTranscript';

const STORAGE_KEY = 'classroomCompanionImportantEvents';
const PENDING_ALERT_KEY = 'classroomCompanionImportantAlertsPending';

export type StoredImportantEvent = {
  id: string;
  title: string;
  snippet: string;
  /** Local calendar day YYYY-MM-DD */
  dateKey: string;
  noteId: number;
  noteTitle: string;
  createdAt: string;
};

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function loadImportantEvents(): StoredImportantEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is StoredImportantEvent =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as StoredImportantEvent).id === 'string' &&
        typeof (x as StoredImportantEvent).dateKey === 'string' &&
        typeof (x as StoredImportantEvent).noteId === 'number',
    );
  } catch {
    return [];
  }
}

function saveImportantEvents(events: StoredImportantEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(0, 250)));
  } catch {
    /* quota or private mode */
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Persist extracted mentions and return the list that was newly added (for alerts).
 */
export function appendImportantEventsFromRecording(
  noteId: number,
  noteTitle: string,
  extracted: ExtractedImportantMention[],
): StoredImportantEvent[] {
  if (extracted.length === 0) return [];
  const existing = loadImportantEvents();
  const added: StoredImportantEvent[] = [];

  for (const e of extracted) {
    const dateKey = toDateKey(e.date);
    const dup = existing.some(
      (x) =>
        x.noteId === noteId &&
        x.dateKey === dateKey &&
        x.title === e.title &&
        x.snippet.slice(0, 80) === e.snippet.slice(0, 80),
    );
    if (dup) continue;
    const row: StoredImportantEvent = {
      id: newId(),
      title: e.title,
      snippet: e.snippet,
      dateKey,
      noteId,
      noteTitle,
      createdAt: new Date().toISOString(),
    };
    added.push(row);
    existing.unshift(row);
  }

  if (added.length > 0) saveImportantEvents(existing);
  return added;
}

export function queueImportantAlertsForHome(events: StoredImportantEvent[]) {
  if (events.length === 0) return;
  try {
    sessionStorage.setItem(PENDING_ALERT_KEY, JSON.stringify(events));
  } catch {
    /* noop */
  }
}

export function consumePendingImportantAlerts(): StoredImportantEvent[] {
  try {
    const raw = sessionStorage.getItem(PENDING_ALERT_KEY);
    if (!raw) return [];
    sessionStorage.removeItem(PENDING_ALERT_KEY);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is StoredImportantEvent =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as StoredImportantEvent).id === 'string' &&
        typeof (x as StoredImportantEvent).dateKey === 'string',
    );
  } catch {
    return [];
  }
}
