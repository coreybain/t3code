import { describe, expect, it } from "vitest";

import { findSparkUsageBucket, getUsageRemainingPercent } from "./UsageLimitViews";

describe("usage limit helpers", () => {
  it("clamps remaining percent for display", () => {
    expect(
      getUsageRemainingPercent({ usedPercent: -20, resetsAt: null, windowDurationMins: null }),
    ).toBe(100);
    expect(
      getUsageRemainingPercent({ usedPercent: 45, resetsAt: null, windowDurationMins: null }),
    ).toBe(55);
    expect(
      getUsageRemainingPercent({ usedPercent: 140, resetsAt: null, windowDurationMins: null }),
    ).toBe(0);
  });

  it("finds Spark usage buckets by id or name", () => {
    const bucket = findSparkUsageBucket({
      checkedAt: "2026-04-29T00:00:00.000Z",
      main: null,
      buckets: [
        {
          id: "codex",
          name: "General usage limits",
          primary: null,
          secondary: null,
        },
        {
          id: "model-specific",
          name: "GPT-5.3-Codex-Spark usage limits",
          primary: null,
          secondary: null,
        },
      ],
    });

    expect(bucket?.id).toBe("model-specific");
  });
});
