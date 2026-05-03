import type { NextFunction, Request, RequestHandler, Response } from "express";
import { verifyToken } from "../lib/auth";
import type { Repository } from "../repositories/repository";
import type { AuthUser } from "../types";

export interface AuthenticatedRequest extends Request {
  authUserId?: number;
  /** Set by `createRequireAuth` after JWT + DB lookup. */
  authUser?: AuthUser;
}

/**
 * Requires a valid Bearer JWT whose `sub` matches an existing user row.
 * Prevents confusing MySQL FK errors when the DB was reset but the browser still holds an old token.
 */
export const createRequireAuth =
  (repo: Repository): RequestHandler =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) return res.status(401).json({ error: "Missing bearer token." });
    let userId: number;
    try {
      userId = verifyToken(token);
    } catch {
      return res.status(401).json({ error: "Invalid or expired token." });
    }
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }
    const user = await repo.findUserById(userId);
    if (!user) {
      return res.status(401).json({
        error: "Your account was not found. Please sign out and sign in again.",
      });
    }
    req.authUserId = userId;
    req.authUser = user;
    return next();
  };
