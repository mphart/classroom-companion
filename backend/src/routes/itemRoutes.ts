import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import type { Item, SortBy, SortDir } from "../types";
import type { Repository } from "../repositories/repository";

const listItemsQuerySchema = z.object({
  directory: z.string().trim().min(1),
  /** When `"true"`, list all items under `directory` (recursive by path prefix). */
  tree: z.enum(["true", "false"]).optional(),
  q: z.string().trim().optional(),
  sortBy: z.enum(["name", "lastEditedDate", "creationDate"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

const renameSchema = z.object({
  newName: z.string().trim().min(1).max(120),
});

const bulkDeleteSchema = z.object({
  itemIds: z.array(z.number().int().positive()).min(1),
});

const toItemResponse = (item: Item) => ({
  id: item.id,
  type: item.type,
  name: item.name,
  directory: item.directoryPath,
  createdDate: item.createdAt.toISOString(),
  lastEditedDate: item.updatedAt.toISOString(),
  ...(item.type === "note"
    ? { noteSourceType: item.noteSourceType ?? "recording" }
    : {}),
});

export const createItemRoutes = (repo: Repository): Router => {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req: AuthenticatedRequest, res, next) => {
    try {
      const query = listItemsQuerySchema.parse(req.query);
      const items = await repo.listItems({
        userId: req.authUserId!,
        directoryPath: query.directory,
        tree: query.tree === "true",
        query: query.q,
        sortBy: query.sortBy as SortBy | undefined,
        sortDir: query.sortDir as SortDir | undefined,
      });
      return res.json({ items: items.map(toItemResponse) });
    } catch (error) {
      return next(error);
    }
  });

  router.patch("/:itemId/rename", async (req: AuthenticatedRequest, res, next) => {
    try {
      const itemId = z.coerce.number().int().positive().parse(req.params.itemId);
      const body = renameSchema.parse(req.body);
      const item = await repo.renameItem({ userId: req.authUserId!, itemId, newName: body.newName });
      if (!item) return res.status(404).json({ error: "Item not found." });
      return res.json({ item: toItemResponse(item) });
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/", async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = bulkDeleteSchema.parse(req.body);
      const deletedCount = await repo.deleteItems({ userId: req.authUserId!, itemIds: body.itemIds });
      return res.json({ deletedCount });
    } catch (error) {
      return next(error);
    }
  });

  return router;
};
