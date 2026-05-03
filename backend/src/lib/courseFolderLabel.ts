import { normalizeDirectoryPath } from './itemPathDepth';

/** Human-readable folder label for the “Course Folder:” line in lecture raw text. */
export function courseFolderLabelFromSaveDirectory(directoryPath: string, userId: number): string {
  const d = normalizeDirectoryPath(directoryPath);
  const root = `${userId}/`;
  if (d === root) return '(Home root)';
  const tail = d.slice(root.length).replace(/\/$/, '');
  const parts = tail.split('/').filter(Boolean);
  return parts.length ? parts.join(' / ') : '(Home root)';
}
