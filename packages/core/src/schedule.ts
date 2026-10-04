import { DateTime } from "luxon";

export type ScheduleTask = {
  id: string;
  estimateMinutes: number;
  score: number;
  pinnedStart: string | null;
  pinnedEnd: string | null;
  blocked: boolean;
  menial: boolean;
  deadline: string | null;
};

export type TimeRange = { start: string; end: string };

export type PlannedBlock = {
  taskId: string;
  start: string;
  end: string;
  pinned: boolean;
};

const SNAP = 15;

function snapUp(dt: DateTime): DateTime {
  const minutes = dt.hour * 60 + dt.minute;
  const snapped = Math.ceil(minutes / SNAP) * SNAP;
  return dt.startOf("day").plus({ minutes: snapped }).set({ second: 0, millisecond: 0 });
}

function rangesOverlap(aStart: DateTime, aEnd: DateTime, bStart: DateTime, bEnd: DateTime): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function fitsBeforeDeadline(start: DateTime, end: DateTime, deadline: string | null, zone: string): boolean {
  if (!deadline) return true;
  const due = DateTime.fromISO(deadline, { setZone: true }).setZone(zone);
  if (!due.hasSame(start, "day")) return true;
  return end <= due;
}

export function scheduleDay(input: {
  day: string;
  zone: string;
  startMin: number;
  endMin: number;
  now: string;
  tasks: ScheduleTask[];
  breaks: TimeRange[];
}): { blocks: PlannedBlock[]; unscheduled: string[] } {
  const zone = input.zone;
  const day = DateTime.fromISO(input.day, { zone }).startOf("day");
  const windowStart = day.plus({ minutes: input.startMin });
  const windowEnd = day.plus({ minutes: input.endMin });
  const now = DateTime.fromISO(input.now, { setZone: true }).setZone(zone);
  const cursorFloor = now.hasSame(day, "day") ? snapUp(now > windowStart ? now : windowStart) : windowStart;

  const occupied: { start: DateTime; end: DateTime }[] = [];
  const blocks: PlannedBlock[] = [];
  const unscheduled: string[] = [];

  function place(taskId: string, start: DateTime, end: DateTime, pinned: boolean) {
    occupied.push({ start, end });
    blocks.push({
      taskId,
      start: start.toUTC().toISO()!,
      end: end.toUTC().toISO()!,
      pinned,
    });
  }

  for (const brk of input.breaks) {
    const start = DateTime.fromISO(brk.start, { setZone: true }).setZone(zone);
    const end = DateTime.fromISO(brk.end, { setZone: true }).setZone(zone);
    if (end > windowStart && start < windowEnd) {
      occupied.push({
        start: start < windowStart ? windowStart : start,
        end: end > windowEnd ? windowEnd : end,
      });
    }
  }

  for (const task of input.tasks) {
    if (!task.pinnedStart || !task.pinnedEnd) continue;
    const start = DateTime.fromISO(task.pinnedStart, { setZone: true }).setZone(zone);
    const end = DateTime.fromISO(task.pinnedEnd, { setZone: true }).setZone(zone);
    place(task.id, start, end, true);
  }

  const pinnedIds = new Set(blocks.map((block) => block.taskId));

  function earliestSlot(estimate: number, deadline: string | null, notBefore: DateTime): { start: DateTime; end: DateTime } | null {
    let cursor = notBefore < windowStart ? windowStart : notBefore;
    if (cursor < cursorFloor && !pinnedIds.size) {
      cursor = cursor < cursorFloor ? cursorFloor : cursor;
    }
    cursor = cursor < cursorFloor ? cursorFloor : cursor;
    const sorted = [...occupied].sort((a, b) => a.start.toMillis() - b.start.toMillis());
    while (cursor.plus({ minutes: estimate }) <= windowEnd) {
      const end = cursor.plus({ minutes: estimate });
      const hit = sorted.find((span) => rangesOverlap(cursor, end, span.start, span.end));
      if (!hit) {
        if (fitsBeforeDeadline(cursor, end, deadline, zone)) return { start: cursor, end };
        return null;
      }
      cursor = snapUp(hit.end);
    }
    return null;
  }

  const flexible = input.tasks
    .filter((task) => !pinnedIds.has(task.id))
    .sort((a, b) => b.score - a.score);

  const primary = flexible.filter((task) => !task.menial);
  const filler = flexible.filter((task) => task.menial);

  for (const task of primary) {
    if (task.blocked) {
      unscheduled.push(task.id);
      continue;
    }
    const slot = earliestSlot(Math.max(task.estimateMinutes, SNAP), task.deadline, cursorFloor);
    if (!slot) unscheduled.push(task.id);
    else place(task.id, slot.start, slot.end, false);
  }

  for (const task of filler) {
    if (task.blocked) {
      unscheduled.push(task.id);
      continue;
    }
    const slot = earliestSlot(Math.max(task.estimateMinutes, SNAP), task.deadline, windowStart < cursorFloor ? cursorFloor : windowStart);
    if (!slot) unscheduled.push(task.id);
    else place(task.id, slot.start, slot.end, false);
  }

  blocks.sort((a, b) => a.start.localeCompare(b.start));
  return { blocks, unscheduled };
}
