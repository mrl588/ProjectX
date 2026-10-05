import { DateTime } from "luxon";

export function nextWorkingDay(day: string, zone: string, weekdays: number[]): string {
  const allowed = new Set(weekdays);
  let cursor = DateTime.fromISO(day, { zone }).startOf("day").plus({ days: 1 });
  for (let i = 0; i < 14; i += 1) {
    if (allowed.has(cursor.weekday)) return cursor.toISODate()!;
    cursor = cursor.plus({ days: 1 });
  }
  return cursor.toISODate()!;
}

export function tasksToRoll(
  tasks: { id: string; status: string; plannedDay: string | null }[],
  today: string,
): string[] {
  return tasks
    .filter((task) => {
      if (task.status !== "not_started" && task.status !== "in_progress") return false;
      if (!task.plannedDay) return false;
      return task.plannedDay < today;
    })
    .map((task) => task.id);
}
