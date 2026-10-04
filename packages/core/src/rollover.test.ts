import { describe, expect, it } from "vitest";
import { extractFromText } from "./extract.js";
import { nextWorkingDay, tasksToRoll } from "./rollover.js";

describe("rollover", () => {
  it("moves unfinished tasks onto the next working day and skips the weekend", () => {
    expect(nextWorkingDay("2026-10-09", "UTC", [1, 2, 3, 4, 5])).toBe("2026-10-12");
    expect(
      tasksToRoll(
        [
          { id: "a", status: "not_started", plannedDay: "2026-10-04" },
          { id: "b", status: "completed", plannedDay: "2026-10-04" },
          { id: "c", status: "in_progress", plannedDay: "2026-10-05" },
        ],
        "2026-10-05",
      ),
    ).toEqual(["a"]);
  });
});

describe("extractFromText", () => {
  it("uses the subject line and notices an urgent Friday deadline", () => {
    const extracted = extractFromText(
      "Re: Vendor contract\nPlease review this before Friday. It is urgent and should take 45 minutes.",
      "2026-10-05T15:00:00.000Z",
      "UTC",
    );
    expect(extracted.title).toBe("Vendor contract");
    expect(extracted.rank).toBe(9);
    expect(extracted.estimateMinutes).toBe(45);
    expect(extracted.deadline).toBe("2026-10-09T17:00:00.000Z");
  });
});
