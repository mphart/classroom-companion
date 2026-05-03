/** Trailing-slash directory prefix, e.g. `12/` or `12/Physics/`. */
export function normalizeDirectoryPath(value: string): string {
  const t = value.trim();
  if (!t.endsWith("/")) return `${t}/`;
  return t;
}

/** Segments after the user root id, e.g. `12/A/B/` → `['A','B']`. */
export function pathSegmentsAfterUserId(normalizedDir: string, userId: number): string[] {
  const dir = normalizeDirectoryPath(normalizedDir);
  const withoutTrailing = dir.slice(0, -1);
  const parts = withoutTrailing.split("/").filter(Boolean);
  if (parts.length === 0 || parts[0] !== String(userId)) return [];
  return parts.slice(1);
}

export function directoryDepthAfterUser(normalizedDir: string, userId: number): number {
  return pathSegmentsAfterUserId(normalizedDir, userId).length;
}

/** Canonical prefix owned by a folder row: `12/A/B/` from `12/A/` + `B`. */
export function folderCanonicalPrefix(directoryPath: string, name: string): string {
  return `${normalizeDirectoryPath(directoryPath)}${name}/`;
}

/** Number of folder-name segments under the user root (max 2). */
export function folderDepthAfterUser(directoryPath: string, name: string, userId: number): number {
  return pathSegmentsAfterUserId(folderCanonicalPrefix(directoryPath, name), userId).length;
}

/** Allowed folder paths: `userId/A/` and `userId/A/B/` only. */
export const MAX_FOLDER_SEGMENTS_AFTER_USER = 2;

export function isDirectoryUnderUserRoot(normalizedDir: string, userId: number): boolean {
  const n = normalizeDirectoryPath(normalizedDir);
  return n === `${userId}/` || n.startsWith(`${userId}/`);
}

/** Parent directory is already at max depth — no new subfolders may be created here. */
export function isFolderCreationBlockedInDirectory(normalizedParentDirectory: string, userId: number): boolean {
  return directoryDepthAfterUser(normalizedParentDirectory, userId) >= MAX_FOLDER_SEGMENTS_AFTER_USER;
}
