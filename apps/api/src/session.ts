import type { Request, Response } from "express";
import { prisma } from "./db.js";

const COOKIE = "pm_session";
const WEEK = 1000 * 60 * 60 * 24 * 14;

export async function createSession(res: Response, userId: string): Promise<void> {
  const session = await prisma.session.create({
    data: { userId, expiresAt: new Date(Date.now() + WEEK) },
  });
  res.cookie(COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: WEEK,
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(COOKIE, { path: "/" });
}

export async function readUser(req: Request) {
  const sessionId = req.cookies?.[COOKIE] as string | undefined;
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return session.user;
}
