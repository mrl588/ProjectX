import { describe, expect, it } from "vitest";
import { colorForTask } from "./color.js";
import { scoreTask } from "./score.js";

const zone = "UTC";
const now = "2026-10-05T15:00:00.000Z";

describe("colorForTask", () => {
  it("turns due today and overdue red even when the rank is low", () => {
    expect(colorForTask({ deadline: "2026-10-05T18:00:00.000Z", rank: 1, now, zone })).toBe("red");
    expect(colorForTask({ deadline: "2026-10-04T18:00:00.000Z", rank: 1, now, zone })).toBe("red");
  });

  it("turns rank 8 and above red when the deadline is far", () => {
    expect(colorForTask({ deadline: "2026-10-20T18:00:00.000Z", rank: 9, now, zone })).toBe("red");
  });

  it("turns a near deadline or a mid rank yellow", () => {
    expect(colorForTask({ deadline: "2026-10-07T18:00:00.000Z", rank: 2, now, zone })).toBe("yellow");
    expect(colorForTask({ deadline: "2026-10-20T18:00:00.000Z", rank: 6, now, zone })).toBe("yellow");
  });

  it("stays green when the deadline is far and the rank is low", () => {
    expect(colorForTask({ deadline: "2026-10-20T18:00:00.000Z", rank: 2, now, zone })).toBe("green");
    expect(colorForTask({ deadline: null, rank: 3, now, zone })).toBe("green");
  });
});

describe("scoreTask", () => {
  it("ranks an overdue task above a calm one", () => {
    const overdue = scoreTask({ deadline: "2026-10-01T18:00:00.000Z", rank: 2, now, zone });
    const calm = scoreTask({ deadline: "2026-10-20T18:00:00.000Z", rank: 9, now, zone });
    expect(overdue).toBeGreaterThan(calm);
  });
});
