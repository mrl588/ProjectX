import { DateTime } from "luxon";

export type TaskColor = "green" | "yellow" | "red";

export function colorForTask(input: {
  deadline: string | null;
  rank: number;
  now: string;
  zone: string;
}): TaskColor {
  const now = DateTime.fromISO(input.now, { setZone: true }).setZone(input.zone);
  if (input.deadline) {
    const deadline = DateTime.fromISO(input.deadline, { setZone: true }).setZone(input.zone);
    const days = deadline.startOf("day").diff(now.startOf("day"), "days").days;
    if (days <= 0) return "red";
  }
  if (input.rank >= 8) return "red";
  if (input.deadline) {
    const deadline = DateTime.fromISO(input.deadline, { setZone: true }).setZone(input.zone);
    const days = deadline.startOf("day").diff(now.startOf("day"), "days").days;
    if (days <= 2) return "yellow";
  }
  if (input.rank >= 5) return "yellow";
  return "green";
}
