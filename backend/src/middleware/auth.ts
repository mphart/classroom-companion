import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../lib/auth";

export interface AuthenticatedRequest extends Request {
  authUserId?: number;
}

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "Missing bearer token." });
  try {
    req.authUserId = verifyToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
};
