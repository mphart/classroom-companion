import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";

export const hashPassword = async (password: string): Promise<string> => bcrypt.hash(password, 10);
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);

export const signToken = (userId: number): string =>
  jwt.sign({ sub: String(userId) }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });

export const verifyToken = (token: string): number => {
  const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
  return Number(payload.sub);
};
