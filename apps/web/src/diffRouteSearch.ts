import { TurnId, type GitDiffScope } from "@t3tools/contracts";

export const SIDE_PANEL_SUMMARY_TAB_ID = "summary";
export const SIDE_PANEL_REVIEW_TAB_ID = "review";
export const SIDE_PANEL_BROWSER_TAB_ID = "browser";

export type SidePanelFixedTabId =
  | typeof SIDE_PANEL_SUMMARY_TAB_ID
  | typeof SIDE_PANEL_REVIEW_TAB_ID
  | typeof SIDE_PANEL_BROWSER_TAB_ID;

export type SidePanelTabId = SidePanelFixedTabId | `file:${string}`;

export interface DiffRouteSearch {
  sidePanel?: "1" | undefined;
  sidePanelExpanded?: "1" | undefined;
  sidePanelTab?: SidePanelTabId | undefined;
  sidePanelTabs?: string | undefined;
  diff?: "1" | undefined;
  fileTree?: "1" | undefined;
  diffTurnId?: TurnId | undefined;
  diffFilePath?: string | undefined;
  diffScope?: GitDiffScope | undefined;
}

function isDiffOpenValue(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
}

function normalizeSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function stripDiffSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<
  T,
  | "diff"
  | "sidePanel"
  | "sidePanelExpanded"
  | "sidePanelTab"
  | "sidePanelTabs"
  | "diffTurnId"
  | "diffFilePath"
  | "diffScope"
> {
  const {
    diff: _diff,
    sidePanel: _sidePanel,
    sidePanelExpanded: _sidePanelExpanded,
    sidePanelTab: _sidePanelTab,
    sidePanelTabs: _sidePanelTabs,
    diffTurnId: _diffTurnId,
    diffFilePath: _diffFilePath,
    diffScope: _diffScope,
    ...rest
  } = params;
  return rest as Omit<
    T,
    | "diff"
    | "sidePanel"
    | "sidePanelExpanded"
    | "sidePanelTab"
    | "sidePanelTabs"
    | "diffTurnId"
    | "diffFilePath"
    | "diffScope"
  >;
}

function isSidePanelTabId(value: string): value is SidePanelTabId {
  return (
    value === SIDE_PANEL_SUMMARY_TAB_ID ||
    value === SIDE_PANEL_REVIEW_TAB_ID ||
    value === SIDE_PANEL_BROWSER_TAB_ID ||
    value.startsWith("file:")
  );
}

function isGitDiffScope(value: string): value is GitDiffScope {
  return value === "unstaged" || value === "staged" || value === "branch";
}

export function encodeFileSidePanelTabId(relativePath: string): SidePanelTabId {
  return `file:${encodeURIComponent(relativePath)}`;
}

export function decodeFileSidePanelTabId(tabId: SidePanelTabId): string | null {
  if (!tabId.startsWith("file:")) {
    return null;
  }
  try {
    const decoded = decodeURIComponent(tabId.slice("file:".length));
    return decoded.trim().length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

export function encodeSidePanelTabs(tabIds: ReadonlyArray<SidePanelTabId>): string | undefined {
  const dynamicTabs = tabIds.filter((tabId) => tabId !== SIDE_PANEL_SUMMARY_TAB_ID);
  return dynamicTabs.length > 0 ? dynamicTabs.join(",") : undefined;
}

export function parseSidePanelTabs(value: string | undefined): SidePanelTabId[] {
  if (!value) {
    return [];
  }
  const seen = new Set<SidePanelTabId>();
  const tabs: SidePanelTabId[] = [];
  for (const part of value.split(",")) {
    const normalized = part.trim();
    if (!normalized || !isSidePanelTabId(normalized)) {
      continue;
    }
    if (normalized === SIDE_PANEL_SUMMARY_TAB_ID || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    tabs.push(normalized);
  }
  return tabs;
}

export function resolveNextSidePanelTab(input: {
  closingTabId: SidePanelTabId;
  activeTabId: SidePanelTabId;
  tabIds: ReadonlyArray<SidePanelTabId>;
}): SidePanelTabId {
  if (input.closingTabId !== input.activeTabId) {
    return input.activeTabId;
  }
  const closingIndex = input.tabIds.indexOf(input.closingTabId);
  const nextTab =
    input.tabIds[closingIndex + 1] ?? input.tabIds[closingIndex - 1] ?? SIDE_PANEL_SUMMARY_TAB_ID;
  return nextTab;
}

export function parseDiffRouteSearch(search: Record<string, unknown>): DiffRouteSearch {
  const legacyDiff = isDiffOpenValue(search.diff) ? "1" : undefined;
  const explicitSidePanel = isDiffOpenValue(search.sidePanel) ? "1" : undefined;
  const sidePanel = explicitSidePanel ?? legacyDiff;
  const sidePanelExpanded =
    sidePanel && isDiffOpenValue(search.sidePanelExpanded) ? "1" : undefined;
  const fileTree = isDiffOpenValue(search.fileTree) ? "1" : undefined;
  const diffTurnIdRaw = sidePanel ? normalizeSearchString(search.diffTurnId) : undefined;
  const diffTurnId = diffTurnIdRaw ? TurnId.make(diffTurnIdRaw) : undefined;
  const diffFilePath = sidePanel ? normalizeSearchString(search.diffFilePath) : undefined;
  const rawDiffScope = normalizeSearchString(search.diffScope);
  const diffScope =
    sidePanel && rawDiffScope && isGitDiffScope(rawDiffScope) ? rawDiffScope : undefined;
  const rawTab = normalizeSearchString(search.sidePanelTab);
  const rawTabs = normalizeSearchString(search.sidePanelTabs);
  const parsedTabs = parseSidePanelTabs(rawTabs);
  const sidePanelTab =
    rawTab && isSidePanelTabId(rawTab)
      ? rawTab
      : legacyDiff
        ? SIDE_PANEL_REVIEW_TAB_ID
        : sidePanel
          ? SIDE_PANEL_SUMMARY_TAB_ID
          : undefined;
  const tabs = new Set<SidePanelTabId>(parsedTabs);
  if (legacyDiff || sidePanelTab === SIDE_PANEL_REVIEW_TAB_ID) {
    tabs.add(SIDE_PANEL_REVIEW_TAB_ID);
  }
  if (sidePanelTab && sidePanelTab !== SIDE_PANEL_SUMMARY_TAB_ID) {
    tabs.add(sidePanelTab);
  }
  const sidePanelTabs = sidePanel ? encodeSidePanelTabs([...tabs]) : undefined;

  return {
    ...(sidePanel ? { sidePanel } : {}),
    ...(sidePanelExpanded ? { sidePanelExpanded } : {}),
    ...(sidePanelTab ? { sidePanelTab } : {}),
    ...(sidePanelTabs ? { sidePanelTabs } : {}),
    ...(legacyDiff ? { diff: legacyDiff } : {}),
    ...(fileTree ? { fileTree } : {}),
    ...(diffTurnId ? { diffTurnId } : {}),
    ...(diffFilePath ? { diffFilePath } : {}),
    ...(diffScope ? { diffScope } : {}),
  };
}
