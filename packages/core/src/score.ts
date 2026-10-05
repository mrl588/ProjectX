import { DateTime } from "luxon";

export function scoreTask(input: {
  deadline: string | null;
  rank: number;
  now: string;
  zone: string;
}): number {
  const now = DateTime.fromISO(input.now, { setZone: true }).setZone(input.zone);
  let urgency = 0;
  if (input.deadline) {
    const deadline = DateTime.fromISO(input.deadline, { setZone: true }).setZone(input.zone);
    const hours = deadline.diff(now, "hours").hours;
    if (hours < 0) urgency = 100;
    else if (deadline.hasSame(now, "day")) urgency = 80;
    else if (hours <= 24) urgency = 60;
    else if (hours <= 72) urgency = 30;
  }
  return input.rank * 10 + urgency;
}
