import type { GitStatusResult, ProjectEntry } from "@t3tools/contracts";

export interface ProjectEntryTreeNode {
  path: string;
  name: string;
  kind: "file" | "directory";
  children: ProjectEntryTreeNode[];
}

interface MutableProjectEntryTreeNode extends ProjectEntryTreeNode {
  children: MutableProjectEntryTreeNode[];
}

function basenameOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

function parentPathOf(path: string): string | undefined {
  const index = path.lastIndexOf("/");
  return index === -1 ? undefined : path.slice(0, index);
}

function compareNodes(left: ProjectEntryTreeNode, right: ProjectEntryTreeNode): number {
  if (left.kind !== right.kind) {
    return left.kind === "directory" ? -1 : 1;
  }
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sortTree(nodes: MutableProjectEntryTreeNode[]): MutableProjectEntryTreeNode[] {
  nodes.sort(compareNodes);
  for (const node of nodes) {
    sortTree(node.children);
  }
  return nodes;
}

function createNode(path: string, kind: "file" | "directory"): MutableProjectEntryTreeNode {
  return {
    path,
    name: basenameOf(path),
    kind,
    children: [],
  };
}

export function buildProjectEntryAncestors(entries: ReadonlyArray<ProjectEntry>): ProjectEntry[] {
  const existingPaths = new Set(entries.map((entry) => entry.path));
  const ancestors: ProjectEntry[] = [];
  const ancestorPaths = new Set<string>();

  for (const entry of entries) {
    let parentPath = parentPathOf(entry.path);
    while (parentPath) {
      if (!existingPaths.has(parentPath) && !ancestorPaths.has(parentPath)) {
        ancestorPaths.add(parentPath);
        ancestors.push({
          path: parentPath,
          kind: "directory",
          parentPath: parentPathOf(parentPath),
        });
      }
      parentPath = parentPathOf(parentPath);
    }
  }

  return ancestors;
}

export function buildProjectEntryTree(
  entries: ReadonlyArray<ProjectEntry>,
): ProjectEntryTreeNode[] {
  const entriesWithAncestors = [...buildProjectEntryAncestors(entries), ...entries];
  const nodeByPath = new Map<string, MutableProjectEntryTreeNode>();

  for (const entry of entriesWithAncestors) {
    const existing = nodeByPath.get(entry.path);
    if (existing) {
      if (existing.kind !== entry.kind && entry.kind === "directory") {
        nodeByPath.set(entry.path, { ...existing, kind: "directory" });
      }
      continue;
    }
    nodeByPath.set(entry.path, createNode(entry.path, entry.kind));
  }

  const roots: MutableProjectEntryTreeNode[] = [];
  for (const node of nodeByPath.values()) {
    const parentPath = parentPathOf(node.path);
    const parent = parentPath ? nodeByPath.get(parentPath) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return sortTree(roots);
}

function filterNode(
  node: ProjectEntryTreeNode,
  normalizedQuery: string,
): ProjectEntryTreeNode | null {
  const matches =
    node.name.toLowerCase().includes(normalizedQuery) ||
    node.path.toLowerCase().includes(normalizedQuery);
  const children = node.children.flatMap((child) => {
    const filtered = filterNode(child, normalizedQuery);
    return filtered ? [filtered] : [];
  });

  if (!matches && children.length === 0) {
    return null;
  }

  return {
    ...node,
    children,
  };
}

export function filterProjectEntryTree(
  nodes: ReadonlyArray<ProjectEntryTreeNode>,
  query: string,
): ProjectEntryTreeNode[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [...nodes];
  }
  return nodes.flatMap((node) => {
    const filtered = filterNode(node, normalizedQuery);
    return filtered ? [filtered] : [];
  });
}

export function buildChangedProjectEntryTree(
  files: ReadonlyArray<GitStatusResult["workingTree"]["files"][number]>,
): ProjectEntryTreeNode[] {
  return buildProjectEntryTree(
    files.map((file) => ({
      path: file.path,
      kind: "file",
      parentPath: parentPathOf(file.path),
    })),
  );
}

export function collectDirectoryPaths(nodes: ReadonlyArray<ProjectEntryTreeNode>): string[] {
  const paths: string[] = [];
  const visit = (node: ProjectEntryTreeNode) => {
    if (node.kind !== "directory") {
      return;
    }
    paths.push(node.path);
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const node of nodes) {
    visit(node);
  }
  return paths;
}
