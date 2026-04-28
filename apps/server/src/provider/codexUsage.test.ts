import { describe, expect, it } from "vitest";

import { normalizeCodexUsageSnapshot } from "./codexUsage.ts";

describe("normalizeCodexUsageSnapshot", () => {
  it("normalizes the backward-compatible single rate limit bucket", () => {
    const snapshot = normalizeCodexUsageSnapshot(
      {
        rateLimits: {
          limitName: "General usage limits",
          primary: { usedPercent: 2, resetsAt: 1_800_000_000_000, windowDurationMins: 300 },
          secondary: { usedPercent: 10, resetsAt: 1_800_604_800_000, windowDurationMins: 10_080 },
        },
      },
      "2026-04-29T00:00:00.000Z",
    );

    expect(snapshot.main?.id).toBe("main");
    expect(snapshot.main?.name).toBe("General usage limits");
    expect(snapshot.main?.primary?.usedPercent).toBe(2);
    expect(snapshot.buckets).toEqual([snapshot.main]);
  });

  it("normalizes keyed codex and spark buckets", () => {
    const snapshot = normalizeCodexUsageSnapshot(
      {
        rateLimits: {
          limitId: "codex",
          limitName: "General usage limits",
          primary: { usedPercent: 2 },
          secondary: { usedPercent: 10 },
        },
        rateLimitsByLimitId: {
          codex: {
            limitId: "codex",
            limitName: "General usage limits",
            primary: { usedPercent: 2 },
            secondary: { usedPercent: 10 },
          },
          spark: {
            limitId: "spark",
            limitName: "GPT-5.3-Codex-Spark usage limits",
            primary: { usedPercent: 0 },
            secondary: { usedPercent: 0 },
          },
        },
      },
      "2026-04-29T00:00:00.000Z",
    );

    expect(snapshot.main?.id).toBe("codex");
    expect(snapshot.buckets.map((bucket) => bucket.id)).toEqual(["codex", "spark"]);
    expect(snapshot.buckets[1]?.name).toBe("GPT-5.3-Codex-Spark usage limits");
  });

  it("preserves a missing spark bucket as absent data", () => {
    const snapshot = normalizeCodexUsageSnapshot(
      {
        rateLimits: {
          limitId: "codex",
          primary: { usedPercent: 25 },
          secondary: { usedPercent: 40 },
        },
        rateLimitsByLimitId: {
          codex: {
            limitId: "codex",
            primary: { usedPercent: 25 },
            secondary: { usedPercent: 40 },
          },
        },
      },
      "2026-04-29T00:00:00.000Z",
    );

    expect(snapshot.buckets.some((bucket) => bucket.id.includes("spark"))).toBe(false);
  });
});
