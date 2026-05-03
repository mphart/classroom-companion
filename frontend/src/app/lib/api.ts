import { clearSession, getToken } from '@/app/lib/authSession';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export type ListedItemDto = {
  id: number;
  type: 'folder' | 'note';
  name: string;
  directory: string;
  createdDate: string;
  lastEditedDate: string;
  noteSourceType?: 'recording' | 'generated_summary' | 'generated_practice_exam';
};

export type NoteDto = {
  id: number;
  title: string;
  directory: string;
  createdDate: string;
  lastEditedDate: string;
  rawText: string;
  aiSummary: string | null;
  language: string;
  durationSeconds: number;
  sourceType: 'recording' | 'generated_summary' | 'generated_practice_exam';
  generatedFromCount: number | null;
};

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function suppressAuthHardRedirect(apiPath: string): boolean {
  const p = apiPath.split('?')[0] ?? '';
  return p.startsWith('/auth/login') || p.startsWith('/auth/signup');
}

async function fetchJson(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await parseBody(res);

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    const errField =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? (payload as { error: unknown }).error
        : undefined;
    if (typeof errField === 'string') message = errField;
    else if (typeof errField === 'number' || typeof errField === 'boolean') message = String(errField);

    if (res.status === 401 && !suppressAuthHardRedirect(path)) {
      clearSession();
      window.location.assign('/');
    }
    throw new Error(message);
  }

  return payload;
}

export async function apiGet(path: string): Promise<unknown> {
  return fetchJson('GET', path);
}

export async function apiPost(path: string, body: unknown): Promise<unknown> {
  return fetchJson('POST', path, body);
}

export async function apiDelete(path: string, body: unknown): Promise<unknown> {
  return fetchJson('DELETE', path, body);
}

export async function apiPatch(path: string, body: unknown): Promise<unknown> {
  return fetchJson('PATCH', path, body);
}

export async function listItems(params: {
  directory: string;
  /** When true, include all items under this directory path (subfolders), not only immediate children. */
  tree?: boolean;
  q?: string;
  sortBy?: 'name' | 'lastEditedDate' | 'creationDate';
  sortDir?: 'asc' | 'desc';
}): Promise<ListedItemDto[]> {
  const qs = new URLSearchParams({ directory: params.directory });
  if (params.tree) qs.set('tree', 'true');
  if (params.q) qs.set('q', params.q);
  if (params.sortBy) qs.set('sortBy', params.sortBy);
  if (params.sortDir) qs.set('sortDir', params.sortDir);
  const payload = (await apiGet(`/items?${qs.toString()}`)) as { items: ListedItemDto[] };
  return payload.items;
}

export async function createFolder(name: string, directory: string): Promise<ListedItemDto> {
  const payload = (await apiPost('/folders', { name, directory })) as { item: ListedItemDto };
  return payload.item;
}

export async function renameItem(itemId: number, newName: string): Promise<ListedItemDto> {
  const payload = (await apiPatch(`/items/${itemId}/rename`, { newName })) as { item: ListedItemDto };
  return payload.item;
}

export async function createNote(body: {
  title: string;
  directory: string;
  rawText: string;
  language: string;
  durationSeconds: number;
}): Promise<NoteDto> {
  const payload = (await apiPost('/notes', body)) as { note: NoteDto };
  return payload.note;
}

export async function getNote(noteId: number): Promise<NoteDto> {
  const payload = (await apiGet(`/notes/${noteId}`)) as { note: NoteDto };
  return payload.note;
}

export async function deleteItems(itemIds: number[]): Promise<number> {
  const payload = (await apiDelete('/items', { itemIds })) as { deletedCount: number };
  return payload.deletedCount;
}

export async function summarizeSelection(body: {
  noteIds: number[];
  folderIds: number[];
  outputDirectory: string;
  title: string;
  /** When set, forces Gemini output language; otherwise the API infers it when all sources share one language. */
  outputLanguage?: string;
}): Promise<{ note: NoteDto; sourceCount: number }> {
  return apiPost('/ai/summarize/selection', body) as Promise<{ note: NoteDto; sourceCount: number }>;
}

export async function generatePracticeExam(body: {
  noteIds: number[];
  folderIds: number[];
  outputDirectory: string;
  title: string;
  questionCount: number;
  includeMultipleChoice: boolean;
  includeShortAnswer: boolean;
  otherInstructions?: string;
}): Promise<{ note: NoteDto; sourceCount: number }> {
  return apiPost('/ai/practice-exam/generate', body) as Promise<{ note: NoteDto; sourceCount: number }>;
}

export type GradeVerdict = 'correct' | 'partial' | 'incorrect';

export async function gradePracticeExamShortAnswers(body: {
  noteId: number;
  responses: { questionIndex: number; answer: string }[];
}): Promise<{ results: { questionIndex: number; verdict: GradeVerdict; feedback: string }[] }> {
  return apiPost('/ai/practice-exam/grade', body) as Promise<{
    results: { questionIndex: number; verdict: GradeVerdict; feedback: string }[];
  }>;
}

export async function regenerateNoteAiSummary(noteId: number): Promise<NoteDto> {
  const payload = (await apiPost(`/ai/summarize/note/${noteId}`, {})) as { note: NoteDto };
  return payload.note;
}

export async function login(body: { username: string; password: string }) {
  return apiPost('/auth/login', body) as Promise<{
    token: string;
    user: { id: number; name: string; username: string };
  }>;
}

export async function signup(body: { name: string; username: string; password: string }) {
  return apiPost('/auth/signup', body) as Promise<{
    token: string;
    user: { id: number; name: string; username: string };
  }>;
}
