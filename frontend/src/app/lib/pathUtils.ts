export function userRootDirectory(userId: number): string {
  return `${userId}/`;
}

export function joinDirectory(parentDirectory: string, folderName: string): string {
  const base = parentDirectory.endsWith('/') ? parentDirectory : `${parentDirectory}/`;
  return `${base}${folderName}/`;
}

export function parentDirectory(path: string): string | null {
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) return null;
  parts.pop();
  return `${parts.join('/')}/`;
}

export function pathTitleSegments(directory: string, userId: number): string[] {
  const normalized = directory.endsWith('/') ? directory.slice(0, -1) : directory;
  const parts = normalized.split('/').filter(Boolean);
  const userPart = String(userId);
  if (parts.length === 0 || parts[0] !== userPart) {
    return ['Home'];
  }
  const tail = parts.slice(1);
  return tail.length === 0 ? ['Home'] : ['Home', ...tail];
}
