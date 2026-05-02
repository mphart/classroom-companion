export type LibraryItemType = 'folder' | 'file';
export type LibraryFileKind = 'lecture' | 'summary';

export interface LibraryItem {
  id: string;
  name: string;
  type: LibraryItemType;
  parentPath: string;
  updatedAt: string;
  content?: string;
  fileKind?: LibraryFileKind;
}

const STORAGE_KEY = 'classroom_companion_library_v1';
const ROOT_PATH = 'Home';

const defaultItems: LibraryItem[] = [
  {
    id: 'seed-folder-physics',
    name: 'Physics',
    type: 'folder',
    parentPath: ROOT_PATH,
    updatedAt: '2026-05-01T10:00:00.000Z',
  },
  {
    id: 'seed-folder-math',
    name: 'Mathematics',
    type: 'folder',
    parentPath: ROOT_PATH,
    updatedAt: '2026-04-30T10:00:00.000Z',
  },
  {
    id: 'seed-lecture-1',
    name: 'Lecture-04-28.txt',
    type: 'file',
    parentPath: ROOT_PATH,
    updatedAt: '2026-04-28T10:00:00.000Z',
    fileKind: 'lecture',
    content:
      'Topic: Intro to course\n\nNotes:\n- Welcome and syllabus overview\n- Grading policy\n\nTranscript:\nToday we reviewed course expectations and upcoming topics.',
  },
];

export function getRootPath(): string {
  return ROOT_PATH;
}

export function buildPath(parentPath: string, name: string): string {
  return `${parentPath}/${name}`;
}

export function loadLibraryItems(): LibraryItem[] {
  if (typeof window === 'undefined') {
    return defaultItems;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultItems;
  }

  try {
    const parsed = JSON.parse(raw) as LibraryItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return defaultItems;
    }
    return parsed;
  } catch {
    return defaultItems;
  }
}

export function saveLibraryItems(items: LibraryItem[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function getChildren(items: LibraryItem[], parentPath: string): LibraryItem[] {
  return items.filter((item) => item.parentPath === parentPath);
}

export function ensureFolder(items: LibraryItem[], folderName: string, parentPath: string): LibraryItem[] {
  const exists = items.some(
    (item) =>
      item.type === 'folder' && item.parentPath === parentPath && item.name.toLowerCase() === folderName.toLowerCase(),
  );
  if (exists) {
    return items;
  }

  return [
    ...items,
    {
      id: crypto.randomUUID(),
      name: folderName,
      type: 'folder',
      parentPath,
      updatedAt: new Date().toISOString(),
    },
  ];
}

export function getFolderPath(item: LibraryItem): string {
  return buildPath(item.parentPath, item.name);
}

export function collectDescendantIds(items: LibraryItem[], folderPath: string): Set<string> {
  const result = new Set<string>();
  const queue = [folderPath];

  while (queue.length > 0) {
    const path = queue.shift();
    if (!path) {
      continue;
    }

    for (const child of items) {
      if (child.parentPath !== path) {
        continue;
      }
      result.add(child.id);
      if (child.type === 'folder') {
        queue.push(getFolderPath(child));
      }
    }
  }

  return result;
}

export function summarizeLectureContent(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return '';
  }
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, 3).join(' ');
}
