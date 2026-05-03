export type CalendarIcsEvent = {
  uid: string;
  title: string;
  dateKey: string;
  description?: string;
};

function parseDateKey(dateKey: string): { y: number; m: number; d: number } | null {
  const [ys, ms, ds] = dateKey.split('-');
  const y = Number.parseInt(ys ?? '', 10);
  const m = Number.parseInt(ms ?? '', 10);
  const d = Number.parseInt(ds ?? '', 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function formatDateKeyForIcs(dateKey: string): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    throw new Error(`Invalid dateKey: ${dateKey}`);
  }
  return `${String(parsed.y).padStart(4, '0')}${String(parsed.m).padStart(2, '0')}${String(parsed.d).padStart(2, '0')}`;
}

function nextDateKey(dateKey: string): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    throw new Error(`Invalid dateKey: ${dateKey}`);
  }
  const next = new Date(parsed.y, parsed.m - 1, parsed.d + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

function escapeIcsText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatUtcTimestamp(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

export function buildIcs(events: CalendarIcsEvent[], now = new Date()): string {
  const dtStamp = formatUtcTimestamp(now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Classroom Companion//Calendar Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const ev of events) {
    const start = formatDateKeyForIcs(ev.dateKey);
    const end = formatDateKeyForIcs(nextDateKey(ev.dateKey));
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcsText(ev.uid)}`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`SUMMARY:${escapeIcsText(ev.title)}`);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${end}`);
    if (ev.description && ev.description.trim().length > 0) {
      lines.push(`DESCRIPTION:${escapeIcsText(ev.description.trim())}`);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function downloadIcsFile(filename: string, icsText: string) {
  const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
