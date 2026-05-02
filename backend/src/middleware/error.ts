import type { NextFunction, Request, Response } from "express";
import { SummarizerError } from "../lib/errors";

export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found." });
};

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof SummarizerError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  const message = error instanceof Error ? error.message : "Internal server error.";
  res.status(500).json({ error: message });
};
