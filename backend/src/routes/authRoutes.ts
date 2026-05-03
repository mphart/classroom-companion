import { Router } from "express";
import { z } from "zod";
import { hashPassword, signToken, verifyPassword } from "../lib/auth";
import { createRequireAuth, type AuthenticatedRequest } from "../middleware/auth";
import type { Repository } from "../repositories/repository";

const signupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  username: z.string().trim().min(3).max(60),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const createAuthRoutes = (repo: Repository): Router => {
  const router = Router();
  const requireAuth = createRequireAuth(repo);

  router.post("/signup", async (req, res, next) => {
    try {
      const parsed = signupSchema.parse(req.body);
      const existing = await repo.findUserByUsername(parsed.username);
      if (existing) return res.status(409).json({ error: "Username already exists." });
      const passwordHash = await hashPassword(parsed.password);
      const user = await repo.createUser({ name: parsed.name, username: parsed.username, passwordHash });
      const token = signToken(user.id);
      return res.status(201).json({ token, user: { id: user.id, name: user.name, username: user.username } });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const parsed = loginSchema.parse(req.body);
      const user = await repo.findUserByUsername(parsed.username);
      if (!user) return res.status(401).json({ error: "Invalid credentials." });
      const ok = await verifyPassword(parsed.password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: "Invalid credentials." });
      const token = signToken(user.id);
      return res.json({ token, user: { id: user.id, name: user.name, username: user.username } });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/logout", (_req, res) => res.status(204).send());

  router.get("/me", requireAuth, (req: AuthenticatedRequest, res) => {
    return res.json({ user: req.authUser! });
  });

  return router;
};
