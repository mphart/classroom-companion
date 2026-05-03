export type LectureNoteRawTextParams = {
  title: string;
  courseLabel: string;
  language: string;
  transcript: string;
  notesPlaceholder: string;
};

/** Matches the lecture note template used when saving a live recording (see frontend ActiveRecording). */
export function buildLectureNoteRawText(p: LectureNoteRawTextParams): string {
  const transcriptBody = p.transcript.trim() || 'No transcript captured yet.';
  return [
    `Lecture: ${p.title}`,
    `Course Folder: ${p.courseLabel}`,
    `Language: ${p.language}`,
    '',
    'Notes:',
    p.notesPlaceholder,
    '',
    'Transcript:',
    transcriptBody,
  ].join('\n');
}
