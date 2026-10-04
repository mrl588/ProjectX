import { describe, expect, it } from "vitest";
import { scheduleDay } from "./schedule.js";

const zone = "UTC";
const day = "2026-10-05";
const now = "2026-10-05T09:00:00.000Z";

describe("scheduleDay", () => {
  it("keeps a pin, skips a blocked task, and fills a gap with a short task", () => {
    const result = scheduleDay({
      day,
      zone,
      startMin: 9 * 60,
      endMin: 12 * 60,
      now,
      breaks: [{ start: "2026-10-05T11:00:00.000Z", end: "2026-10-05T11:15:00.000Z" }],
      tasks: [
        {
          id: "focus",
          estimateMinutes: 60,
          score: 100,
          pinnedStart: null,
          pinnedEnd: null,
          blocked: false,
          menial: false,
          deadline: null,
        },
        {
          id: "pin",
          estimateMinutes: 30,
          score: 50,
          pinnedStart: "2026-10-05T10:00:00.000Z",
          pinnedEnd: "2026-10-05T10:30:00.000Z",
          blocked: false,
          menial: false,
          deadline: null,
        },
        {
          id: "blocked",
          estimateMinutes: 30,
          score: 90,
          pinnedStart: null,
          pinnedEnd: null,
          blocked: true,
          menial: false,
          deadline: null,
        },
        {
          id: "file",
          estimateMinutes: 30,
          score: 10,
          pinnedStart: null,
          pinnedEnd: null,
          blocked: false,
          menial: true,
          deadline: null,
        },
      ],
    });

    const byId = Object.fromEntries(result.blocks.map((block) => [block.taskId, block]));
    expect(byId.pin.pinned).toBe(true);
    expect(byId.pin.start).toBe("2026-10-05T10:00:00.000Z");
    expect(byId.focus.start).toBe("2026-10-05T09:00:00.000Z");
    expect(byId.focus.end).toBe("2026-10-05T10:00:00.000Z");
    expect(byId.file.start).toBe("2026-10-05T10:30:00.000Z");
    expect(result.unscheduled).toContain("blocked");
    expect(result.blocks.some((block) => block.start < "2026-10-05T11:15:00.000Z" && block.end > "2026-10-05T11:00:00.000Z" && block.taskId !== "pin")).toBe(false);
  });

  it("leaves a task unscheduled when the day is full", () => {
    const result = scheduleDay({
      day,
      zone,
      startMin: 9 * 60,
      endMin: 10 * 60,
      now,
      breaks: [],
      tasks: [
        {
          id: "long",
          estimateMinutes: 120,
          score: 40,
          pinnedStart: null,
          pinnedEnd: null,
          blocked: false,
          menial: false,
          deadline: null,
        },
      ],
    });
    expect(result.blocks).toHaveLength(0);
    expect(result.unscheduled).toEqual(["long"]);
  });
});
