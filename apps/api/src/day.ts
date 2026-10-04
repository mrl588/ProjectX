import { DateTime } from "luxon";
import {
  colorForTask,
  extractFromText,
  nextWorkingDay,
  scheduleDay,
  scoreTask,
  tasksToRoll,
  type ScheduleTask,
} from "@pm/core";
import { prisma } from "./db.js";

const OPEN = ["not_started", "in_progress"] as const;

export function dayBounds(day: string, zone: string) {
  const start = DateTime.fromISO(day, { zone }).startOf("day");
  return { start, end: start.plus({ days: 1 }) };
}

export async function rollForward(userId: string, today: string, zone: string) {
  const [tasks, hours] = await Promise.all([
    prisma.task.findMany({
      where: { userId, status: { in: [...OPEN] } },
      select: { id: true, status: true, plannedDay: true },
    }),
    prisma.workingHours.findMany({ where: { userId }, select: { weekday: true } }),
  ]);
  const ids = tasksToRoll(tasks, today);
  if (ids.length === 0) return;
  const weekdays = hours.map((row) => row.weekday);
  const next = nextWorkingDay(today, zone, weekdays.length > 0 ? weekdays : [1, 2, 3, 4, 5, 6, 7]);
  await prisma.task.updateMany({ where: { id: { in: ids }, userId }, data: { plannedDay: next } });
}

export async function reschedule(userId: string, day: string, zone: string, now: DateTime) {
  const weekday = DateTime.fromISO(day, { zone }).weekday;
  const hours = await prisma.workingHours.findUnique({
    where: { userId_weekday: { userId, weekday } },
  });
  if (!hours) return [] as string[];
  const { start, end } = dayBounds(day, zone);
  const [tasks, existing] = await Promise.all([
    prisma.task.findMany({
      where: { userId, plannedDay: day, status: { in: [...OPEN] } },
      include: { blockedBy: { include: { blocker: true } } },
    }),
    prisma.calendarBlock.findMany({
      where: { userId, startsAt: { gte: start.toJSDate(), lt: end.toJSDate() } },
    }),
  ]);
  const pins = new Map(
    existing.filter((block) => block.kind === "task" && block.pinned && block.taskId).map((block) => [block.taskId!, block]),
  );
  const scheduleTasks: ScheduleTask[] = tasks.map((task) => {
    const pin = pins.get(task.id);
    const blocked = task.blockedBy.some((link) => link.blocker.status !== "completed");
    return {
      id: task.id,
      estimateMinutes: task.estimateMinutes,
      score: scoreTask({
        deadline: task.deadline?.toISOString() ?? null,
        rank: task.rank,
        now: now.toISO()!,
        zone,
      }),
      pinnedStart: pin ? pin.startsAt.toISOString() : null,
      pinnedEnd: pin ? pin.endsAt.toISOString() : null,
      blocked,
      menial: task.menial || (task.rank <= 3 && task.estimateMinutes <= 20),
      deadline: task.deadline?.toISOString() ?? null,
    };
  });
  const windowStart = DateTime.fromISO(day, { zone }).startOf("day").plus({ minutes: hours.startMin });
  const windowEnd = DateTime.fromISO(day, { zone }).startOf("day").plus({ minutes: hours.endMin });
  const effectiveNow = now < windowStart || now > windowEnd ? windowStart : now;
  const planned = scheduleDay({
    day,
    zone,
    startMin: hours.startMin,
    endMin: hours.endMin,
    now: effectiveNow.toISO()!,
    tasks: scheduleTasks,
    breaks: existing
      .filter((block) => block.kind === "break")
      .map((block) => ({ start: block.startsAt.toISOString(), end: block.endsAt.toISOString() })),
  });
  await prisma.calendarBlock.deleteMany({
    where: {
      userId,
      kind: "task",
      pinned: false,
      startsAt: { gte: start.toJSDate(), lt: end.toJSDate() },
    },
  });
  const titles = new Map(tasks.map((task) => [task.id, task.title]));
  for (const block of planned.blocks) {
    if (block.pinned) continue;
    await prisma.calendarBlock.create({
      data: {
        userId,
        taskId: block.taskId,
        startsAt: new Date(block.start),
        endsAt: new Date(block.end),
        pinned: false,
        kind: "task",
        title: titles.get(block.taskId) ?? "Task",
      },
    });
  }
  return planned.unscheduled;
}

async function ensureSummary(userId: string, day: string, zone: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.lastSummaryDay === day) return;
  const [carried, inbox, dueToday] = await Promise.all([
    prisma.task.count({
      where: { userId, plannedDay: day, status: { in: [...OPEN] }, createdAt: { lt: dayBounds(day, zone).start.toJSDate() } },
    }),
    prisma.task.count({ where: { userId, status: "inbox" } }),
    prisma.task.count({
      where: {
        userId,
        status: { in: [...OPEN, "inbox"] },
        deadline: { gte: dayBounds(day, zone).start.toJSDate(), lt: dayBounds(day, zone).end.toJSDate() },
      },
    }),
  ]);
  const carriedLine = carried === 0 ? "Nothing carried over from yesterday." : `${carried} still open from earlier.`;
  await prisma.notification.create({
    data: {
      userId,
      title: "Morning summary",
      body: `${carriedLine} ${inbox} new item${inbox === 1 ? "" : "s"} to confirm. ${dueToday} deadline${dueToday === 1 ? "" : "s"} today.`,
    },
  });
  await prisma.user.update({ where: { id: userId }, data: { lastSummaryDay: day } });
}

function presentTask(
  task: {
    id: string;
    title: string;
    detail: string;
    status: string;
    rank: number;
    estimateMinutes: number;
    deadline: Date | null;
    plannedDay: string | null;
    menial: boolean;
    source: { url: string | null; kind: string } | null;
    blockedBy: { blocker: { id: string; title: string; status: string } }[];
  },
  nowIso: string,
  zone: string,
) {
  const openBlockers = task.blockedBy.filter((link) => link.blocker.status !== "completed");
  return {
    id: task.id,
    title: task.title,
    detail: task.detail,
    status: task.status,
    rank: task.rank,
    estimateMinutes: task.estimateMinutes,
    deadline: task.deadline?.toISOString() ?? null,
    plannedDay: task.plannedDay,
    menial: task.menial,
    sourceUrl: task.source?.url ?? null,
    sourceKind: task.source?.kind ?? null,
    color: colorForTask({ deadline: task.deadline?.toISOString() ?? null, rank: task.rank, now: nowIso, zone }),
    blocked: openBlockers.length > 0,
    blockers: openBlockers.map((link) => link.blocker),
  };
}

export async function loadHome(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const zone = user.timezone;
  const now = DateTime.now().setZone(zone);
  const day = now.toISODate()!;
  await rollForward(userId, day, zone);
  await ensureSummary(userId, day, zone);
  const unscheduled = await reschedule(userId, day, zone, now);
  const { start, end } = dayBounds(day, zone);
  const weekday = now.weekday;
  const [hours, tasks, inbox, blocks, reminders, summary] = await Promise.all([
    prisma.workingHours.findUnique({ where: { userId_weekday: { userId, weekday } } }),
    prisma.task.findMany({
      where: { userId, plannedDay: day, status: { in: ["not_started", "in_progress", "completed"] } },
      include: { blockedBy: { include: { blocker: true } }, source: true },
      orderBy: [{ status: "asc" }, { rank: "desc" }],
    }),
    prisma.task.findMany({
      where: {
        userId,
        status: "inbox",
        OR: [{ deferredUntil: null }, { deferredUntil: { lte: now.toJSDate() } }],
      },
      include: { blockedBy: { include: { blocker: true } }, source: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.calendarBlock.findMany({
      where: { userId, startsAt: { gte: start.toJSDate(), lt: end.toJSDate() } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.reminder.findMany({
      where: {
        userId,
        done: false,
        fireAt: { lte: now.toJSDate() },
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now.toJSDate() } }],
      },
      orderBy: { fireAt: "asc" },
    }),
    prisma.notification.findFirst({
      where: { userId, title: "Morning summary", createdAt: { gte: start.toJSDate(), lt: end.toJSDate() } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const nowIso = now.toISO()!;
  const taskColor = new Map(tasks.map((task) => [task.id, presentTask(task, nowIso, zone).color]));
  return {
    user: { id: user.id, name: user.name, email: user.email, timezone: zone },
    day,
    now: nowIso,
    hours: hours ? { startMin: hours.startMin, endMin: hours.endMin } : null,
    tasks: tasks.map((task) => presentTask(task, nowIso, zone)),
    inbox: inbox.map((task) => presentTask(task, nowIso, zone)),
    blocks: blocks.map((block) => ({
      id: block.id,
      taskId: block.taskId,
      title: block.title,
      startsAt: block.startsAt.toISOString(),
      endsAt: block.endsAt.toISOString(),
      pinned: block.pinned,
      kind: block.kind,
      color: block.taskId ? taskColor.get(block.taskId) ?? "green" : "green",
    })),
    unscheduled,
    reminders: reminders.map((reminder) => ({
      id: reminder.id,
      title: reminder.title,
      fireAt: reminder.fireAt.toISOString(),
    })),
    summary: summary ? { id: summary.id, title: summary.title, body: summary.body, createdAt: summary.createdAt.toISOString() } : null,
  };
}

export async function seedUser(userId: string) {
  const existing = await prisma.task.count({ where: { userId } });
  if (existing > 0) return;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const zone = user.timezone;
  const now = DateTime.now().setZone(zone);
  const day = now.toISODate()!;
  await prisma.workingHours.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      userId,
      weekday,
      startMin: 9 * 60,
      endMin: 18 * 60,
    })),
  });
  const source = await prisma.source.create({
    data: {
      userId,
      kind: "paste",
      rawPayload: { sample: true },
    },
  });
  const headcount = await prisma.task.create({
    data: {
      userId,
      title: "Get headcount from finance",
      detail: "Hiring plan is stuck until this number lands.",
      status: "not_started",
      rank: 7,
      estimateMinutes: 20,
      deadline: now.set({ hour: 16, minute: 0, second: 0, millisecond: 0 }).toUTC().toJSDate(),
      plannedDay: day,
    },
  });
  const hiring = await prisma.task.create({
    data: {
      userId,
      title: "Update the hiring plan",
      detail: "Waiting on finance.",
      status: "not_started",
      rank: 4,
      estimateMinutes: 40,
      plannedDay: day,
    },
  });
  await prisma.taskBlocker.create({
    data: { userId, taskId: hiring.id, blockerId: headcount.id },
  });
  await prisma.task.createMany({
    data: [
      {
        userId,
        title: "Review the Q3 forecast",
        detail: "Finance wants a yes or a rewrite before the evening send.",
        status: "in_progress",
        rank: 8,
        estimateMinutes: 60,
        deadline: now.set({ hour: 17, minute: 0, second: 0, millisecond: 0 }).toUTC().toJSDate(),
        plannedDay: day,
      },
      {
        userId,
        title: "Send the deck to Maya",
        detail: "She presents it tomorrow morning.",
        status: "not_started",
        rank: 6,
        estimateMinutes: 45,
        deadline: now.plus({ days: 1 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 }).toUTC().toJSDate(),
        plannedDay: day,
      },
      {
        userId,
        title: "File the expense report",
        detail: "Receipts are already in the folder.",
        status: "not_started",
        rank: 2,
        estimateMinutes: 15,
        menial: true,
        plannedDay: day,
      },
    ],
  });
  const samples = [
    "Vendor contract\nPlease review this before Friday. It is urgent and should take 45 minutes.",
    "Risk team follow-up\nCan you reply to Jordan today? About 20 minutes.",
    "Board memo\nNo rush. Push the notes into the Monday draft when you can.",
  ];
  for (const text of samples) {
    const extracted = extractFromText(text, now.toISO()!, zone);
    await prisma.task.create({
      data: {
        userId,
        sourceId: source.id,
        title: extracted.title,
        detail: text,
        status: "inbox",
        rank: extracted.rank,
        estimateMinutes: extracted.estimateMinutes,
        deadline: extracted.deadline ? new Date(extracted.deadline) : null,
      },
    });
  }
  const lunchStart = now.set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
  await prisma.calendarBlock.create({
    data: {
      userId,
      title: "Lunch",
      kind: "break",
      pinned: true,
      startsAt: lunchStart.toUTC().toJSDate(),
      endsAt: lunchStart.plus({ minutes: 30 }).toUTC().toJSDate(),
    },
  });
  await prisma.reminder.create({
    data: {
      userId,
      title: "Check email",
      fireAt: now.minus({ minutes: 1 }).toUTC().toJSDate(),
    },
  });
}

export async function moveBlock(userId: string, blockId: string, startMin: number) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const zone = user.timezone;
  const now = DateTime.now().setZone(zone);
  const day = now.toISODate()!;
  const block = await prisma.calendarBlock.findFirst({ where: { id: blockId, userId } });
  if (!block || block.kind !== "task" || !block.taskId) return null;
  const task = await prisma.task.findFirst({ where: { id: block.taskId, userId } });
  if (!task) return null;
  const start = DateTime.fromISO(day, { zone }).startOf("day").plus({ minutes: startMin });
  const end = start.plus({ minutes: task.estimateMinutes });
  await prisma.calendarBlock.update({
    where: { id: block.id },
    data: { startsAt: start.toUTC().toJSDate(), endsAt: end.toUTC().toJSDate(), pinned: true },
  });
  await reschedule(userId, day, zone, now);
  return { ok: true };
}
