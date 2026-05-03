/** Matches backend `MAX_FOLDER_SEGMENTS_AFTER_USER` — max folder nesting under `userId/`. */
export const MAX_FOLDER_SEGMENTS_AFTER_USER = 2;

/** Segments after the user id, e.g. `12/A/B/` → `['A','B']`. */
export function pathSegmentsAfterUserId(directory: string, userId: number): string[] {
  const normalized = directory.endsWith('/') ? directory : `${directory}/`;
  const withoutTrailing = normalized.slice(0, -1);
  const parts = withoutTrailing.split('/').filter(Boolean);
  if (parts.length === 0 || parts[0] !== String(userId)) return [];
  return parts.slice(1);
}

export function directoryDepthAfterUser(directory: string, userId: number): number {
  return pathSegmentsAfterUserId(directory, userId).length;
}

/** False when already at `userId/A/B/` — no deeper subfolders allowed. */
export function canCreateSubfolderInDirectory(directory: string, userId: number): boolean {
  return directoryDepthAfterUser(directory, userId) < MAX_FOLDER_SEGMENTS_AFTER_USER;
}
