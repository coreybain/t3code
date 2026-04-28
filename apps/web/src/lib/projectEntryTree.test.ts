import { describe, expect, it } from "vitest";

import {
  buildChangedProjectEntryTree,
  buildProjectEntryAncestors,
  buildProjectEntryTree,
  filterProjectEntryTree,
} from "./projectEntryTree";

describe("projectEntryTree", () => {
  it("builds nested trees from flat project entries", () => {
    const tree = buildProjectEntryTree([
      { path: "src/index.ts", kind: "file", parentPath: "src" },
      { path: "src/components/Button.tsx", kind: "file", parentPath: "src/components" },
      { path: "README.md", kind: "file" },
    ]);

    expect(tree.map((node) => node.path)).toEqual(["src", "README.md"]);
    expect(tree[0]?.children.map((node) => node.path)).toEqual(["src/components", "src/index.ts"]);
    expect(tree[0]?.children[0]?.children.map((node) => node.path)).toEqual([
      "src/components/Button.tsx",
    ]);
  });

  it("keeps matching ancestors when filtering", () => {
    const tree = buildProjectEntryTree([
      { path: "src/components/Button.tsx", kind: "file", parentPath: "src/components" },
      { path: "docs/guide.md", kind: "file", parentPath: "docs" },
    ]);

    const filtered = filterProjectEntryTree(tree, "button");

    expect(filtered.map((node) => node.path)).toEqual(["src"]);
    expect(filtered[0]?.children.map((node) => node.path)).toEqual(["src/components"]);
    expect(filtered[0]?.children[0]?.children.map((node) => node.path)).toEqual([
      "src/components/Button.tsx",
    ]);
  });

  it("matches full paths when filtering", () => {
    const tree = buildProjectEntryTree([
      { path: "apps/web/src/main.tsx", kind: "file", parentPath: "apps/web/src" },
      {
        path: "packages/contracts/src/index.ts",
        kind: "file",
        parentPath: "packages/contracts/src",
      },
    ]);

    const filtered = filterProjectEntryTree(tree, "web/src");

    expect(filtered.map((node) => node.path)).toEqual(["apps"]);
  });

  it("sorts directories before files within a parent", () => {
    const tree = buildProjectEntryTree([
      { path: "src/z.ts", kind: "file", parentPath: "src" },
      { path: "src/components", kind: "directory", parentPath: "src" },
      { path: "src/a.ts", kind: "file", parentPath: "src" },
    ]);

    expect(tree[0]?.children.map((node) => node.path)).toEqual([
      "src/components",
      "src/a.ts",
      "src/z.ts",
    ]);
  });

  it("builds directory ancestors for changed files", () => {
    const tree = buildChangedProjectEntryTree([
      { path: "apps/web/src/main.tsx", insertions: 1, deletions: 0 },
    ]);

    expect(tree[0]?.path).toBe("apps");
    expect(tree[0]?.children[0]?.path).toBe("apps/web");
    expect(tree[0]?.children[0]?.children[0]?.path).toBe("apps/web/src");
    expect(tree[0]?.children[0]?.children[0]?.children[0]?.path).toBe("apps/web/src/main.tsx");
  });

  it("deduplicates generated ancestors", () => {
    const ancestors = buildProjectEntryAncestors([
      { path: "src/a.ts", kind: "file", parentPath: "src" },
      { path: "src/b.ts", kind: "file", parentPath: "src" },
    ]);

    expect(ancestors).toEqual([{ path: "src", kind: "directory", parentPath: undefined }]);
  });
});
