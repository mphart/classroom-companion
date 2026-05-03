import type { Item } from "../types";
import { HttpClientError } from "./errors";
import {
  directoryDepthAfterUser,
  folderCanonicalPrefix,
  isDirectoryUnderUserRoot,
  MAX_FOLDER_SEGMENTS_AFTER_USER,
  normalizeDirectoryPath,
  pathSegmentsAfterUserId,
} from "./itemPathDepth";

export type MoveValidationResult =
  | { kind: "noop" }
  | { kind: "note"; target: string }
  | { kind: "folder"; target: string; oldPrefix: string; newPrefix: string };

export function validateMoveItemContext(
  userId: number,
  item: Item,
  targetDirectoryRaw: string,
  allItems: Item[],
): MoveValidationResult {
  const target = normalizeDirectoryPath(targetDirectoryRaw);
  if (!isDirectoryUnderUserRoot(target, userId)) {
    throw new HttpClientError("Invalid target directory.", 400);
  }
  const currentParent = normalizeDirectoryPath(item.directoryPath);
  if (currentParent === target) {
    return { kind: "noop" };
  }

  const clash = allItems.some(
    (i) =>
      i.userId === userId &&
      i.id !== item.id &&
      normalizeDirectoryPath(i.directoryPath) === target &&
      i.name === item.name,
  );
  if (clash) {
    throw new HttpClientError("An item with this name already exists in that folder.", 409);
  }

  if (item.type === "folder") {
    const oldPrefix = folderCanonicalPrefix(item.directoryPath, item.name);
    if (target.startsWith(oldPrefix)) {
      throw new HttpClientError("Cannot move a folder into itself or its subfolder.", 400);
    }
    const targetDepth = directoryDepthAfterUser(target, userId);
    if (targetDepth >= MAX_FOLDER_SEGMENTS_AFTER_USER) {
      throw new HttpClientError("Folders cannot be placed inside the innermost folder.", 400);
    }
    const newPrefix = folderCanonicalPrefix(target, item.name);
    for (const f of allItems) {
      if (f.userId !== userId || f.type !== "folder") continue;
      const fp = folderCanonicalPrefix(f.directoryPath, f.name);
      if (!fp.startsWith(oldPrefix)) continue;
      const suffix = fp.slice(oldPrefix.length);
      const newCanon = newPrefix + suffix;
      const depth = pathSegmentsAfterUserId(newCanon, userId).length;
      if (depth > MAX_FOLDER_SEGMENTS_AFTER_USER) {
        throw new HttpClientError("Cannot nest folders deeper than two levels.", 400);
      }
    }
    return { kind: "folder", target, oldPrefix, newPrefix };
  }

  return { kind: "note", target };
}
