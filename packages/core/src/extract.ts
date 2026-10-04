import { DateTime } from "luxon";

export type ExtractedTask = {
  title: string;
  rank: number;
  estimateMinutes: number;
  deadline: string | null;
};

function nextWeekday(now: DateTime, weekday: number): DateTime {
  let cursor = now.startOf("day");
  for (let i = 0; i < 8; i += 1) {
    if (cursor.weekday === weekday && cursor > now.startOf("day")) return cursor;
    if (i === 0 && cursor.weekday === weekday) return cursor;
    cursor = cursor.plus({ days: 1 });
    if (cursor.weekday === weekday) return cursor;
  }
  return now;
}

export function extractFromText(text: string, nowIso: string, zone: string): ExtractedTask {
  const trimmed = text.trim();
  const lines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);
  const title = (lines[0] || "Untitled").replace(/^(re:|fw:)\s+/i, "").slice(0, 160);
  const lower = trimmed.toLowerCase();
  const now = DateTime.fromISO(nowIso, { setZone: true }).setZone(zone);
  let deadline: string | null = null;
  if (/\b(eod|end of day|today)\b/.test(lower)) {
    deadline = now.set({ hour: 17, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO();
  } else if (lower.includes("tomorrow")) {
    deadline = now.plus({ days: 1 }).set({ hour: 17, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO();
  } else if (lower.includes("friday")) {
    deadline = nextWeekday(now, 5).set({ hour: 17, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO();
  }
  let rank = 5;
  if (/\b(urgent|asap|immediately)\b/.test(lower)) rank = 9;
  else if (/\b(low priority|when you can|no rush)\b/.test(lower)) rank = 2;
  const estimateMatch = lower.match(/(\d+)\s*(min|minute|minutes|hr|hour|hours)/);
  let estimateMinutes = 30;
  if (estimateMatch) {
    const amount = Number(estimateMatch[1]);
    estimateMinutes = estimateMatch[2].startsWith("h") ? amount * 60 : amount;
  }
  return { title, rank, estimateMinutes, deadline };
}
