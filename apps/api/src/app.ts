import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { DateTime } from "luxon";
import { z } from "zod";
import { prisma } from "./db.js";
import { loadHome, moveBlock, reschedule, seedUser } from "./day.js";
import { extractTasks } from "./extract.js";
import { mountGoogleAuth } from "./google.js";
import { clearSession, createSession, readUser } from "./session.js";

const devLoginSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(80),
});

const pasteSchema = z.object({
  text: z.string().trim().min(1).max(20000),
});

const confirmSchema = z.object({
  rank: z.number().int().min(1).max(10),
});

const delaySchema = z.object({
  when: z.enum(["later", "tomorrow", "next_week"]),
});

const patchSchema = z.object({
  rank: z.number().int().min(1).max(10).optional(),
  status: z.enum(["not_started", "in_progress", "completed"]).optional(),
});

const moveSchema = z.object({
  startMin: z.number().int().min(0).max(24 * 60),
});

const hoursSchema = z.object({
  startMin: z.number().int().min(0).max(24 * 60),
  endMin: z.number().int().min(0).max(24 * 60),
});

async function requireUser(req: Request, res: Response, next: NextFunction) {
  const user = await readUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  res.locals.user = user;
  next();
}

export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  mountGoogleAuth(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/auth/dev", async (req, res) => {
    if (process.env.ALLOW_DEV_LOGIN === "false") {
      res.status(404).json({ error: "Dev login is off" });
      return;
    }
    const parsed = devLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter a name and email" });
      return;
    }
    const user = await prisma.user.upsert({
      where: { email: parsed.data.email.toLowerCase() },
      update: { name: parsed.data.name },
      create: { email: parsed.data.email.toLowerCase(), name: parsed.data.name },
    });
    await seedUser(user.id);
    await createSession(res, user.id);
    res.json({ id: user.id, name: user.name, email: user.email });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const sessionId = req.cookies?.pm_session as string | undefined;
    if (sessionId) await prisma.session.deleteMany({ where: { id: sessionId } });
    clearSession(res);
    res.json({ ok: true });
  });

  app.get("/api/me", requireUser, (req, res) => {
    const user = res.locals.user as { id: string; name: string; email: string; timezone: string };
    res.json({ id: user.id, name: user.name, email: user.email, timezone: user.timezone });
  });

  app.get("/api/home", requireUser, async (_req, res, next) => {
    try {
      const user = res.locals.user as { id: string };
      res.json(await loadHome(user.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/inbox/paste", requireUser, async (req, res, next) => {
    try {
      const parsed = pasteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Paste a message first" });
        return;
      }
      const user = res.locals.user as { id: string; timezone: string };
      const now = DateTime.now().setZone(user.timezone);
      const extracted = await extractTasks(parsed.data.text, now.toISO()!, user.timezone);
      const source = await prisma.source.create({
        data: {
          userId: user.id,
          kind: "paste",
          rawPayload: { text: parsed.data.text },
          modelOutput: extracted.modelOutput ?? undefined,
        },
      });
      await prisma.task.createMany({
        data: extracted.tasks.map((task) => ({
          userId: user.id,
          sourceId: source.id,
          title: task.title,
          detail: parsed.data.text,
          status: "inbox",
          rank: task.rank,
          estimateMinutes: task.estimateMinutes,
          deadline: task.deadline ? new Date(task.deadline) : null,
        })),
      });
      await prisma.notification.create({
        data: {
          userId: user.id,
          title: `${extracted.tasks.length} new task${extracted.tasks.length === 1 ? "" : "s"}`,
          body: extracted.tasks.map((task) => task.title).join(", "),
        },
      });
      res.json(await loadHome(user.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:id/confirm", requireUser, async (req, res, next) => {
    try {
      const parsed = confirmSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Pick a priority from 1 to 10" });
        return;
      }
      const user = res.locals.user as { id: string; timezone: string };
      const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: user.id, status: "inbox" } });
      if (!task) {
        res.status(404).json({ error: "That item is no longer waiting" });
        return;
      }
      const day = DateTime.now().setZone(user.timezone).toISODate()!;
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "not_started", rank: parsed.data.rank, plannedDay: day, deferredUntil: null },
      });
      res.json(await loadHome(user.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:id/delay", requireUser, async (req, res, next) => {
    try {
      const parsed = delaySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Choose when to bring this back" });
        return;
      }
      const user = res.locals.user as { id: string; timezone: string };
      const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: user.id, status: "inbox" } });
      if (!task) {
        res.status(404).json({ error: "That item is no longer waiting" });
        return;
      }
      const now = DateTime.now().setZone(user.timezone);
      const until =
        parsed.data.when === "later"
          ? now.plus({ hours: 4 })
          : parsed.data.when === "tomorrow"
            ? now.plus({ days: 1 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
            : now.plus({ days: 7 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
      await prisma.task.update({
        where: { id: task.id },
        data: { deferredUntil: until.toUTC().toJSDate() },
      });
      res.json(await loadHome(user.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:id/dismiss", requireUser, async (req, res, next) => {
    try {
      const user = res.locals.user as { id: string };
      const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: user.id, status: "inbox" } });
      if (!task) {
        res.status(404).json({ error: "That item is no longer waiting" });
        return;
      }
      await prisma.task.update({ where: { id: task.id }, data: { status: "dismissed" } });
      res.json(await loadHome(user.id));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/tasks/:id", requireUser, async (req, res, next) => {
    try {
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Nothing to update" });
        return;
      }
      const user = res.locals.user as { id: string; timezone: string };
      const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: user.id } });
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }
      await prisma.task.update({
        where: { id: task.id },
        data: {
          ...(parsed.data.rank !== undefined ? { rank: parsed.data.rank } : {}),
          ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        },
      });
      const now = DateTime.now().setZone(user.timezone);
      await reschedule(user.id, now.toISODate()!, user.timezone, now);
      res.json(await loadHome(user.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/blocks/:id/move", requireUser, async (req, res, next) => {
    try {
      const parsed = moveSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Pick a time on the calendar" });
        return;
      }
      const user = res.locals.user as { id: string };
      const moved = await moveBlock(user.id, req.params.id, parsed.data.startMin);
      if (!moved) {
        res.status(404).json({ error: "Block not found" });
        return;
      }
      res.json(await loadHome(user.id));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/hours", requireUser, async (req, res, next) => {
    try {
      const parsed = hoursSchema.safeParse(req.body);
      if (!parsed.success || parsed.data.endMin <= parsed.data.startMin) {
        res.status(400).json({ error: "End time has to be after the start" });
        return;
      }
      const user = res.locals.user as { id: string; timezone: string };
      const weekday = DateTime.now().setZone(user.timezone).weekday;
      await prisma.workingHours.upsert({
        where: { userId_weekday: { userId: user.id, weekday } },
        update: parsed.data,
        create: { userId: user.id, weekday, ...parsed.data },
      });
      res.json(await loadHome(user.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/reminders/:id/done", requireUser, async (req, res, next) => {
    try {
      const user = res.locals.user as { id: string };
      await prisma.reminder.updateMany({ where: { id: req.params.id, userId: user.id }, data: { done: true } });
      res.json(await loadHome(user.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/reminders/:id/snooze", requireUser, async (req, res, next) => {
    try {
      const user = res.locals.user as { id: string; timezone: string };
      const until = DateTime.now().setZone(user.timezone).plus({ minutes: 30 }).toUTC().toJSDate();
      await prisma.reminder.updateMany({
        where: { id: req.params.id, userId: user.id },
        data: { snoozedUntil: until },
      });
      res.json(await loadHome(user.id));
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  });

  return app;
}
