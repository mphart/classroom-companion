import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import type { Repository } from "../repositories/repository";

const folderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  directory: z.string().trim().min(1).max(500),
});

export const createFolderRoutes = (repo: Repository): Router => {
  const router = Router();
  router.use(requireAuth);

  router.post("/", async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = folderSchema.parse(req.body);
      const folder = await repo.createFolder({ userId: req.authUserId!, name: body.name, directoryPath: body.directory });
      return res.status(201).json({
        item: {
          id: folder.id,
          type: folder.type,
          name: folder.name,
          directory: folder.directoryPath,
          createdDate: folder.createdAt.toISOString(),
          lastEditedDate: folder.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
};
