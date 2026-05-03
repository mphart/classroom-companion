/** Pull the live-transcript section from a saved lecture note body. */
export function extractTranscriptSection(rawText: string): string {
  const marker = /\nTranscript:\s*\n/i;
  const m = rawText.match(marker);
  if (!m || m.index === undefined) return rawText;
  return rawText.slice(m.index + m[0].length).trim();
}

export type ExtractedImportantMention = {
  /** Short label for calendar / alert */
  title: string;
  /** Supporting text from the lecture */
  snippet: string;
  date: Date;
};

const IMPORTANCE = /\b(exam|midterm|final|quiz|test|due|deadline|assignment|homework|paper|project)\b/i;

const WEEK: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  fri: 5,
  friday: 5,
  saturday: 6,
  sat: 6,
};

const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addLocalDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** First weekday `targetDow` (0=Sun) on or after `dayStart` (midnight). */
function firstWeekdayOnOrAfter(dayStart: Date, targetDow: number): Date {
  const cur = startOfLocalDay(dayStart);
  for (let i = 0; i < 8; i++) {
    if (cur.getDay() === targetDow) return cur;
    cur.setDate(cur.getDate() + 1);
  }
  return startOfLocalDay(dayStart);
}

function weekdayFromPhrase(which: 'this' | 'next', dayWord: string, anchor: Date): Date | null {
  const target = WEEK[dayWord.toLowerCase()];
  if (target === undefined) return null;
  const anchorDay = startOfLocalDay(anchor);
  const thisOcc = firstWeekdayOnOrAfter(anchorDay, target);
  if (which === 'next') return addLocalDays(thisOcc, 7);
  return thisOcc;
}

const REL_PHRASE =
  /\b(this|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/gi;

const ON_WEEKDAY = /\b(?:on|by)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi;

const MONTH_DAY =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;

const SLASH_DATE = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g;

function inferTitle(sentence: string): string {
  const s = sentence.toLowerCase();
  if (/\bmidterm\b/.test(s)) return 'Midterm mentioned';
  if (/\bfinal\b/.test(s)) return 'Final mentioned';
  if (/\bquiz\b/.test(s)) return 'Quiz mentioned';
  if (/\bexam\b/.test(s)) return 'Exam mentioned';
  if (/\b(due|deadline|assignment|homework|paper|project)\b/.test(s)) return 'Deadline mentioned';
  return 'Important date mentioned';
}

function parseMonthDaySentence(sentence: string, anchor: Date): Date | null {
  MONTH_DAY.lastIndex = 0;
  const m = MONTH_DAY.exec(sentence);
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  if (mon === undefined) return null;
  const dayNum = Number.parseInt(m[2], 10);
  if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) return null;
  let year = anchor.getFullYear();
  const candidate = new Date(year, mon, dayNum);
  candidate.setHours(0, 0, 0, 0);
  if (candidate < startOfLocalDay(anchor)) {
    year += 1;
    candidate.setFullYear(year);
  }
  return candidate;
}

function parseSlashDate(sentence: string, anchor: Date): Date | null {
  SLASH_DATE.lastIndex = 0;
  const m = SLASH_DATE.exec(sentence);
  if (!m) return null;
  const a = Number.parseInt(m[1], 10);
  const b = Number.parseInt(m[2], 10);
  const yRaw = m[3] ? Number.parseInt(m[3], 10) : NaN;
  let month: number;
  let day: number;
  let year: number;
  if (a > 12) {
    day = a;
    month = b - 1;
    year = Number.isFinite(yRaw) ? (yRaw < 100 ? 2000 + yRaw : yRaw) : anchor.getFullYear();
  } else {
    month = a - 1;
    day = b;
    year = Number.isFinite(yRaw) ? (yRaw < 100 ? 2000 + yRaw : yRaw) : anchor.getFullYear();
  }
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const candidate = new Date(year, month, day);
  candidate.setHours(0, 0, 0, 0);
  if (!Number.isFinite(yRaw) && candidate < startOfLocalDay(anchor)) {
    candidate.setFullYear(year + 1);
  }
  return candidate;
}

function tryExtractDateFromSentence(sentence: string, anchor: Date): Date | null {
  REL_PHRASE.lastIndex = 0;
  const rm = REL_PHRASE.exec(sentence);
  if (rm) {
    const which = rm[1].toLowerCase() === 'next' ? 'next' : 'this';
    return weekdayFromPhrase(which, rm[2], anchor);
  }

  ON_WEEKDAY.lastIndex = 0;
  const om = ON_WEEKDAY.exec(sentence);
  if (om) {
    return weekdayFromPhrase('this', om[1], anchor);
  }

  if (/\btomorrow\b/i.test(sentence)) {
    return addLocalDays(startOfLocalDay(anchor), 1);
  }
  if (/\btoday\b/i.test(sentence)) {
    return startOfLocalDay(anchor);
  }

  const md = parseMonthDaySentence(sentence, anchor);
  if (md) return md;

  const sd = parseSlashDate(sentence, anchor);
  if (sd) return sd;

  return null;
}

function splitRoughSentences(text: string): string[] {
  const parts = text.split(/\n+/).flatMap((line) => line.split(/(?<=[.!?])\s+/));
  return parts.map((p) => p.trim()).filter((p) => p.length > 12);
}

/**
 * Best-effort scan of transcript text for exam / deadline language tied to a calendar date.
 * Uses the lecture end time as “today” for phrases like “this Thursday”.
 */
export function extractImportantDatesFromTranscript(
  transcriptText: string,
  anchorDate: Date = new Date(),
): ExtractedImportantMention[] {
  const cleaned = transcriptText.replace(/\s+/g, ' ').trim();
  if (!cleaned || /^no transcript captured/i.test(cleaned)) return [];

  const sentences = splitRoughSentences(cleaned);
  const out: ExtractedImportantMention[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    IMPORTANCE.lastIndex = 0;
    if (!IMPORTANCE.test(sentence)) continue;
    const date = tryExtractDateFromSentence(sentence, anchorDate);
    if (!date) continue;
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${inferTitle(sentence)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const snippet = sentence.length > 220 ? `${sentence.slice(0, 217)}…` : sentence;
    out.push({ title: inferTitle(sentence), snippet, date });
  }

  return out;
}
