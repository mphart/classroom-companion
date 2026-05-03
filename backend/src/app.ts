import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { ZodError } from "zod";
import { errorHandler, notFoundHandler } from "./middleware/error";
import type { Repository } from "./repositories/repository";
import { createAiRoutes } from "./routes/aiRoutes";
import { createAuthRoutes } from "./routes/authRoutes";
import { createFolderRoutes } from "./routes/folderRoutes";
import { createItemRoutes } from "./routes/itemRoutes";
import { createNoteRoutes } from "./routes/noteRoutes";
import { createYoutubeRoutes } from "./routes/youtubeRoutes";
import path from "path";

dotenv.config();
// Repo root `.env` (e.g. PRACTICE_API_KEY next to docker-compose); does not override keys already set from backend/.env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const createApp = (repo: Repository) => {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("dev"));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/auth", createAuthRoutes(repo));
  app.use("/items", createItemRoutes(repo));
  app.use("/folders", createFolderRoutes(repo));
  app.use("/notes", createNoteRoutes(repo));
  app.use("/youtube", createYoutubeRoutes(repo));
  app.use("/ai", createAiRoutes(repo));

  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof ZodError) return res.status(400).json({ error: "Validation failed.", issues: error.issues });
    return next(error);
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};
