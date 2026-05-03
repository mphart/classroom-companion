import type { NextFunction, Request, Response } from "express";
import { HttpClientError, SummarizerError } from "../lib/errors";

export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found." });
};

function jsonWithOptionalDetails(
  res: Response,
  statusCode: number,
  message: string,
  details?: Record<string, unknown>,
) {
  const body: Record<string, unknown> = { error: message };
  if (details && Object.keys(details).length > 0) {
    body.details = details;
  }
  return res.status(statusCode).json(body);
}

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpClientError) {
    return jsonWithOptionalDetails(res, error.statusCode, error.message, error.details);
  }
  if (error instanceof SummarizerError) {
    return jsonWithOptionalDetails(res, error.statusCode, error.message, error.details);
  }
  const message = error instanceof Error ? error.message : "Internal server error.";
  res.status(500).json({ error: message });
};
