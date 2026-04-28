import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import { CodexUsageSnapshot } from "./usage.ts";

const decodeUsage = Schema.decodeUnknownSync(CodexUsageSnapshot);

describe("CodexUsageSnapshot", () => {
  it("decodes a minimal snapshot", () => {
    expect(
      decodeUsage({
        checkedAt: "2026-04-29T00:00:00.000Z",
        main: null,
        buckets: [],
      }),
    ).toEqual({
      checkedAt: "2026-04-29T00:00:00.000Z",
      main: null,
      buckets: [],
    });
  });

  it("rejects invalid usage percentages", () => {
    expect(() =>
      decodeUsage({
        checkedAt: "2026-04-29T00:00:00.000Z",
        main: {
          id: "main",
          name: "General usage limits",
          primary: {
            usedPercent: 101,
            resetsAt: null,
            windowDurationMins: null,
          },
          secondary: null,
        },
        buckets: [],
      }),
    ).toThrow();
  });

  it("allows nullable reset and window fields", () => {
    const snapshot = decodeUsage({
      checkedAt: "2026-04-29T00:00:00.000Z",
      main: {
        id: "main",
        name: "General usage limits",
        primary: {
          usedPercent: 2,
          resetsAt: null,
          windowDurationMins: null,
        },
        secondary: null,
      },
      buckets: [],
    });

    expect(snapshot.main?.primary?.resetsAt).toBeNull();
    expect(snapshot.main?.primary?.windowDurationMins).toBeNull();
  });
});
