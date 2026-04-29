import type { GitStatusResult } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { resolveThreadPr } from "./ThreadStatusIndicators";

const baseStatus: GitStatusResult = {
  isRepo: true,
  hasOriginRemote: true,
  isDefaultBranch: false,
  branch: "feature/thread-work",
  hasWorkingTreeChanges: true,
  workingTree: {
    files: [{ path: "src/app.ts", insertions: 1, deletions: 0 }],
    insertions: 1,
    deletions: 0,
  },
  hasUpstream: true,
  aheadCount: 0,
  behindCount: 0,
  pr: null,
};

describe("resolveThreadPr", () => {
  it("returns the open PR for the matching thread branch", () => {
    const pr = {
      number: 42,
      title: "Thread work",
      url: "https://example.com/pull/42",
      baseBranch: "main",
      headBranch: "feature/thread-work",
      state: "open" as const,
    };

    expect(resolveThreadPr("feature/thread-work", { ...baseStatus, pr })).toBe(pr);
  });

  it("does not show a PR icon for local-only changes without an open PR", () => {
    expect(resolveThreadPr("feature/thread-work", baseStatus)).toBeNull();
  });

  it("returns a closed PR for the matching thread branch", () => {
    const closedPr = {
      number: 42,
      title: "Thread work",
      url: "https://example.com/pull/42",
      baseBranch: "main",
      headBranch: "feature/thread-work",
      state: "closed" as const,
    };

    expect(resolveThreadPr("feature/thread-work", { ...baseStatus, pr: closedPr })).toBe(closedPr);
  });

  it("does not show merged PRs as active thread PRs", () => {
    const mergedPr = {
      number: 42,
      title: "Thread work",
      url: "https://example.com/pull/42",
      baseBranch: "main",
      headBranch: "feature/thread-work",
      state: "merged" as const,
    };

    expect(resolveThreadPr("feature/thread-work", { ...baseStatus, pr: mergedPr })).toBeNull();
  });

  it("does not attach another branch's open PR to the thread", () => {
    const pr = {
      number: 42,
      title: "Other work",
      url: "https://example.com/pull/42",
      baseBranch: "main",
      headBranch: "feature/other-work",
      state: "open" as const,
    };

    expect(resolveThreadPr("feature/thread-work", { ...baseStatus, pr })).toBeNull();
  });
});
