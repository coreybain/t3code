import { parsePatchFiles } from "@pierre/diffs";
import { FileDiff, type FileDiffMetadata, Virtualizer } from "@pierre/diffs/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { scopeThreadRef } from "@t3tools/client-runtime";
import { DEFAULT_MODEL_BY_PROVIDER, type GitDiffScope, type TurnId } from "@t3tools/contracts";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Columns2Icon,
  EllipsisVerticalIcon,
  FileCode2Icon,
  Maximize2Icon,
  Minimize2Icon,
  RefreshCwIcon,
  Rows3Icon,
  TextWrapIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGitStatus } from "~/lib/gitStatusState";
import { checkpointDiffQueryOptions, gitDiffQueryOptions } from "~/lib/providerReactQuery";
import { cn } from "~/lib/utils";
import {
  encodeFileSidePanelTabId,
  encodeSidePanelTabs,
  parseDiffRouteSearch,
  parseSidePanelTabs,
  SIDE_PANEL_REVIEW_TAB_ID,
  stripDiffSearchParams,
} from "../diffRouteSearch";
import { DraftId, useComposerDraftStore } from "../composerDraftStore";
import { useTheme } from "../hooks/useTheme";
import { buildPatchCacheKey } from "../lib/diffRendering";
import { resolveDiffThemeName } from "../lib/diffRendering";
import { useTurnDiffSummaries } from "../hooks/useTurnDiffSummaries";
import { selectProjectByRef, useStore } from "../store";
import { createThreadSelectorByRef } from "../storeSelectors";
import { buildThreadRouteParams, resolveThreadRouteRef } from "../threadRoutes";
import { buildLocalDraftThread } from "./ChatView.logic";
import { useSettings } from "../hooks/useSettings";
import { formatShortTimestamp } from "../timestampFormat";
import { DiffPanelLoadingState, DiffPanelShell, type DiffPanelMode } from "./DiffPanelShell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/menu";
import { Toggle } from "./ui/toggle";
import { Button } from "./ui/button";

type DiffRenderMode = "stacked" | "split";
type DiffThemeType = "light" | "dark";
type DiffSelectionKind = "last-turn" | GitDiffScope | "turn";

const TOP_LEVEL_DIFF_SCOPE_LABELS: Record<Exclude<DiffSelectionKind, "turn">, string> = {
  "last-turn": "Last turn",
  unstaged: "Unstaged",
  staged: "Staged",
  branch: "Branch",
};

const DIFF_PANEL_UNSAFE_CSS = `
[data-diffs-header],
[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  --diffs-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-light-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-dark-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;

  --diffs-bg-context-override: color-mix(in srgb, var(--background) 97%, var(--foreground));
  --diffs-bg-hover-override: color-mix(in srgb, var(--background) 94%, var(--foreground));
  --diffs-bg-separator-override: color-mix(in srgb, var(--background) 95%, var(--foreground));
  --diffs-bg-buffer-override: color-mix(in srgb, var(--background) 90%, var(--foreground));

  --diffs-bg-addition-override: color-mix(in srgb, var(--background) 92%, var(--success));
  --diffs-bg-addition-number-override: color-mix(in srgb, var(--background) 88%, var(--success));
  --diffs-bg-addition-hover-override: color-mix(in srgb, var(--background) 85%, var(--success));
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, var(--background) 80%, var(--success));

  --diffs-bg-deletion-override: color-mix(in srgb, var(--background) 92%, var(--destructive));
  --diffs-bg-deletion-number-override: color-mix(in srgb, var(--background) 88%, var(--destructive));
  --diffs-bg-deletion-hover-override: color-mix(in srgb, var(--background) 85%, var(--destructive));
  --diffs-bg-deletion-emphasis-override: color-mix(
    in srgb,
    var(--background) 80%,
    var(--destructive)
  );

  background-color: var(--diffs-bg) !important;
}

[data-file-info] {
  background-color: color-mix(in srgb, var(--card) 94%, var(--foreground)) !important;
  border-block-color: var(--border) !important;
  color: var(--foreground) !important;
}

[data-diffs-header] {
  position: sticky !important;
  top: 0;
  z-index: 4;
  background-color: color-mix(in srgb, var(--card) 94%, var(--foreground)) !important;
  border-bottom: 1px solid var(--border) !important;
}

[data-title] {
  cursor: pointer;
  transition:
    color 120ms ease,
    text-decoration-color 120ms ease;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 2px;
}

[data-title]:hover {
  color: color-mix(in srgb, var(--foreground) 84%, var(--primary)) !important;
  text-decoration-color: currentColor;
}

.diff-render-file [data-diffs-header] {
  display: none !important;
}
`;

type RenderablePatch =
  | {
      kind: "files";
      files: FileDiffMetadata[];
    }
  | {
      kind: "raw";
      text: string;
      reason: string;
    };

function getRenderablePatch(
  patch: string | undefined,
  cacheScope = "diff-panel",
): RenderablePatch | null {
  if (!patch) return null;
  const normalizedPatch = patch.trim();
  if (normalizedPatch.length === 0) return null;

  try {
    const parsedPatches = parsePatchFiles(
      normalizedPatch,
      buildPatchCacheKey(normalizedPatch, cacheScope),
    );
    const files = parsedPatches.flatMap((parsedPatch) => parsedPatch.files);
    if (files.length > 0) {
      return { kind: "files", files };
    }

    return {
      kind: "raw",
      text: normalizedPatch,
      reason: "Unsupported diff format. Showing raw patch.",
    };
  } catch {
    return {
      kind: "raw",
      text: normalizedPatch,
      reason: "Failed to parse patch. Showing raw patch.",
    };
  }
}

function resolveFileDiffPath(fileDiff: FileDiffMetadata): string {
  const raw = fileDiff.name ?? fileDiff.prevName ?? "";
  if (raw.startsWith("a/") || raw.startsWith("b/")) {
    return raw.slice(2);
  }
  return raw;
}

function buildFileDiffRenderKey(fileDiff: FileDiffMetadata): string {
  return fileDiff.cacheKey ?? `${fileDiff.prevName ?? "none"}:${fileDiff.name}`;
}

interface DiffPanelProps {
  mode?: DiffPanelMode;
}

export { DiffWorkerPoolProvider } from "./DiffWorkerPoolProvider";

export default function DiffPanel({ mode = "inline" }: DiffPanelProps) {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const settings = useSettings();
  const [diffRenderMode, setDiffRenderMode] = useState<DiffRenderMode>("stacked");
  const [diffWordWrap, setDiffWordWrap] = useState(settings.diffWordWrap);
  const [collapsedDiffFiles, setCollapsedDiffFiles] = useState<Set<string>>(() => new Set());
  const patchViewportRef = useRef<HTMLDivElement>(null);
  const previousDiffOpenRef = useRef(false);
  const routeThreadRef = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  const routeDraftId = useParams({
    strict: false,
    select: (params) => (params.draftId ? DraftId.make(params.draftId) : null),
  });
  const diffSearch = useSearch({ strict: false, select: (search) => parseDiffRouteSearch(search) });
  const diffOpen =
    diffSearch.sidePanel === "1" && diffSearch.sidePanelTab === SIDE_PANEL_REVIEW_TAB_ID;
  const activeThreadId = routeThreadRef?.threadId ?? null;
  const serverThread = useStore(
    useMemo(() => createThreadSelectorByRef(routeThreadRef), [routeThreadRef]),
  );
  const draftThread = useComposerDraftStore((store) =>
    routeDraftId ? store.getDraftSession(routeDraftId) : null,
  );
  const draftProject = useStore((store) =>
    draftThread?.projectId
      ? selectProjectByRef(store, {
          environmentId: draftThread.environmentId,
          projectId: draftThread.projectId,
        })
      : undefined,
  );
  const activeThread = useMemo(
    () =>
      serverThread ??
      (draftThread && routeDraftId
        ? buildLocalDraftThread(
            draftThread.threadId,
            draftThread,
            draftProject?.defaultModelSelection ?? {
              provider: "codex",
              model: DEFAULT_MODEL_BY_PROVIDER.codex,
            },
            null,
          )
        : undefined),
    [draftProject?.defaultModelSelection, draftThread, routeDraftId, serverThread],
  );
  const activeProjectId = activeThread?.projectId ?? null;
  const activeProject = useStore((store) =>
    activeThread && activeProjectId
      ? selectProjectByRef(store, {
          environmentId: activeThread.environmentId,
          projectId: activeProjectId,
        })
      : undefined,
  );
  const activeCwd = activeThread?.worktreePath ?? activeProject?.cwd;
  const gitStatusQuery = useGitStatus({
    environmentId: activeThread?.environmentId ?? null,
    cwd: activeCwd ?? null,
  });
  const isGitRepo = gitStatusQuery.data?.isRepo ?? true;
  const { turnDiffSummaries, inferredCheckpointTurnCountByTurnId } =
    useTurnDiffSummaries(activeThread);
  const orderedTurnDiffSummaries = useMemo(
    () =>
      [...turnDiffSummaries].toSorted((left, right) => {
        const leftTurnCount =
          left.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[left.turnId] ?? 0;
        const rightTurnCount =
          right.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[right.turnId] ?? 0;
        if (leftTurnCount !== rightTurnCount) {
          return rightTurnCount - leftTurnCount;
        }
        return right.completedAt.localeCompare(left.completedAt);
      }),
    [inferredCheckpointTurnCountByTurnId, turnDiffSummaries],
  );

  const selectedDiffScope = diffSearch.diffScope ?? null;
  const selectedTurnId = selectedDiffScope ? null : (diffSearch.diffTurnId ?? null);
  const selectedFilePath = diffSearch.diffFilePath ?? null;
  const selectedTurn = selectedDiffScope
    ? undefined
    : selectedTurnId === null
      ? orderedTurnDiffSummaries[0]
      : (orderedTurnDiffSummaries.find((summary) => summary.turnId === selectedTurnId) ??
        orderedTurnDiffSummaries[0]);
  const selectedDiffSelectionKind: DiffSelectionKind = selectedDiffScope
    ? selectedDiffScope
    : selectedTurnId
      ? "turn"
      : "last-turn";
  const selectedDiffLabel =
    selectedDiffSelectionKind === "turn"
      ? selectedTurn
        ? `Turn ${
            selectedTurn.checkpointTurnCount ??
            inferredCheckpointTurnCountByTurnId[selectedTurn.turnId] ??
            "?"
          }`
        : "Turn"
      : TOP_LEVEL_DIFF_SCOPE_LABELS[selectedDiffSelectionKind];
  const selectedCheckpointTurnCount =
    selectedTurn &&
    (selectedTurn.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[selectedTurn.turnId]);
  const selectedCheckpointRange = useMemo(
    () =>
      typeof selectedCheckpointTurnCount === "number"
        ? {
            fromTurnCount: Math.max(0, selectedCheckpointTurnCount - 1),
            toTurnCount: selectedCheckpointTurnCount,
          }
        : null,
    [selectedCheckpointTurnCount],
  );
  const activeCheckpointRange = selectedTurn ? selectedCheckpointRange : null;
  const activeCheckpointDiffQuery = useQuery(
    checkpointDiffQueryOptions({
      environmentId: activeThread?.environmentId ?? null,
      threadId: activeThreadId,
      fromTurnCount: activeCheckpointRange?.fromTurnCount ?? null,
      toTurnCount: activeCheckpointRange?.toTurnCount ?? null,
      cacheScope: selectedTurn ? `turn:${selectedTurn.turnId}` : null,
      enabled: isGitRepo && !selectedDiffScope,
    }),
  );
  const gitDiffQuery = useQuery(
    gitDiffQueryOptions({
      environmentId: activeThread?.environmentId ?? null,
      cwd: activeCwd ?? null,
      scope: selectedDiffScope,
      enabled: isGitRepo && selectedDiffScope !== null,
    }),
  );
  const selectedTurnCheckpointDiff = selectedTurn
    ? activeCheckpointDiffQuery.data?.diff
    : undefined;
  const selectedGitDiff = selectedDiffScope ? gitDiffQuery.data?.diff : undefined;
  const isLoadingCheckpointDiff = selectedDiffScope
    ? gitDiffQuery.isLoading
    : activeCheckpointDiffQuery.isLoading;
  const checkpointDiffError =
    (selectedDiffScope ? gitDiffQuery.error : activeCheckpointDiffQuery.error) instanceof Error
      ? ((selectedDiffScope ? gitDiffQuery.error : activeCheckpointDiffQuery.error) as Error)
          .message
      : (selectedDiffScope ? gitDiffQuery.error : activeCheckpointDiffQuery.error)
        ? selectedDiffScope
          ? "Failed to load git diff."
          : "Failed to load checkpoint diff."
        : null;

  const selectedPatch = selectedDiffScope ? selectedGitDiff : selectedTurnCheckpointDiff;
  const hasResolvedPatch = typeof selectedPatch === "string";
  const hasNoNetChanges = hasResolvedPatch && selectedPatch.trim().length === 0;
  const renderablePatch = useMemo(
    () => getRenderablePatch(selectedPatch, `diff-panel:${resolvedTheme}`),
    [resolvedTheme, selectedPatch],
  );
  const renderableFiles = useMemo(() => {
    if (!renderablePatch || renderablePatch.kind !== "files") {
      return [];
    }
    return renderablePatch.files.toSorted((left, right) =>
      resolveFileDiffPath(left).localeCompare(resolveFileDiffPath(right), undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }, [renderablePatch]);
  const allDiffsCollapsed =
    renderableFiles.length > 0 &&
    renderableFiles.every((fileDiff) => collapsedDiffFiles.has(resolveFileDiffPath(fileDiff)));

  useEffect(() => {
    if (diffOpen && !previousDiffOpenRef.current) {
      setDiffWordWrap(settings.diffWordWrap);
    }
    previousDiffOpenRef.current = diffOpen;
  }, [diffOpen, settings.diffWordWrap]);

  useEffect(() => {
    setCollapsedDiffFiles(new Set());
  }, [selectedPatch]);

  useEffect(() => {
    if (!selectedFilePath || !patchViewportRef.current) {
      return;
    }
    const target = Array.from(
      patchViewportRef.current.querySelectorAll<HTMLElement>("[data-diff-file-path]"),
    ).find((element) => element.dataset.diffFilePath === selectedFilePath);
    target?.scrollIntoView({ block: "nearest" });
  }, [selectedFilePath, renderableFiles]);

  const openDiffFileInPanel = useCallback(
    (filePath: string) => {
      if (!activeThread) return;
      const targetTab = encodeFileSidePanelTabId(filePath);
      const target = routeDraftId
        ? {
            to: "/draft/$draftId" as const,
            params: { draftId: routeDraftId },
          }
        : {
            to: "/$environmentId/$threadId" as const,
            params: buildThreadRouteParams(
              scopeThreadRef(activeThread.environmentId, activeThread.id),
            ),
          };
      void navigate({
        ...target,
        search: (previous) => {
          const tabs = parseSidePanelTabs(parseDiffRouteSearch(previous).sidePanelTabs);
          if (!tabs.includes(SIDE_PANEL_REVIEW_TAB_ID)) {
            tabs.push(SIDE_PANEL_REVIEW_TAB_ID);
          }
          if (!tabs.includes(targetTab)) {
            tabs.push(targetTab);
          }
          return {
            ...previous,
            sidePanel: "1",
            sidePanelTab: targetTab,
            sidePanelTabs: encodeSidePanelTabs(tabs),
          };
        },
      });
    },
    [activeThread, navigate, routeDraftId],
  );

  const navigateReviewSearch = useCallback(
    (select: { diffScope?: GitDiffScope; turnId?: TurnId }) => {
      if (!activeThread) return;
      const target = routeDraftId
        ? {
            to: "/draft/$draftId" as const,
            params: { draftId: routeDraftId },
          }
        : {
            to: "/$environmentId/$threadId" as const,
            params: buildThreadRouteParams(
              scopeThreadRef(activeThread.environmentId, activeThread.id),
            ),
          };
      void navigate({
        ...target,
        search: (previous) => {
          const rest = stripDiffSearchParams(previous);
          const tabs = parseSidePanelTabs(diffSearch.sidePanelTabs);
          if (!tabs.includes(SIDE_PANEL_REVIEW_TAB_ID)) {
            tabs.push(SIDE_PANEL_REVIEW_TAB_ID);
          }
          return {
            ...rest,
            sidePanel: "1",
            sidePanelTab: SIDE_PANEL_REVIEW_TAB_ID,
            sidePanelTabs: encodeSidePanelTabs(tabs),
            diffTurnId: undefined,
            diffFilePath: undefined,
            diffScope: undefined,
            ...(select.diffScope ? { diffScope: select.diffScope } : {}),
            ...(select.turnId ? { diffTurnId: select.turnId } : {}),
          };
        },
      });
    },
    [activeThread, diffSearch.sidePanelTabs, navigate, routeDraftId],
  );
  const selectTurn = (turnId: TurnId) => {
    navigateReviewSearch({ turnId });
  };
  const selectDiffScope = (scope: GitDiffScope | "last-turn") => {
    navigateReviewSearch(scope === "last-turn" ? {} : { diffScope: scope });
  };
  const refreshDiff = () => {
    if (selectedDiffScope) {
      void gitDiffQuery.refetch();
      return;
    }
    void activeCheckpointDiffQuery.refetch();
  };
  const toggleDiffFileCollapsed = (filePath: string) => {
    setCollapsedDiffFiles((current) => {
      const next = new Set(current);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const headerRow = (
    <>
      <div className="flex min-w-0 flex-1 items-center [-webkit-app-region:no-drag]">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="Select diff scope"
                className="min-w-32 max-w-full justify-between font-medium"
                size="xs"
                variant="outline"
              />
            }
          >
            <span className="truncate">{selectedDiffLabel}</span>
            <ChevronDownIcon className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {(["last-turn", "unstaged", "staged", "branch"] as const).map((scope) => (
              <DropdownMenuItem key={scope} onClick={() => selectDiffScope(scope)}>
                <CheckIcon
                  className={cn(
                    "size-3.5",
                    selectedDiffSelectionKind === scope ? "opacity-100" : "opacity-0",
                  )}
                />
                {TOP_LEVEL_DIFF_SCOPE_LABELS[scope]}
              </DropdownMenuItem>
            ))}
            {orderedTurnDiffSummaries.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <CheckIcon
                      className={cn(
                        "size-3.5",
                        selectedDiffSelectionKind === "turn" ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">
                      {selectedDiffSelectionKind === "turn" ? selectedDiffLabel : "Turns"}
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    {orderedTurnDiffSummaries.map((summary) => {
                      const turnCount =
                        summary.checkpointTurnCount ??
                        inferredCheckpointTurnCountByTurnId[summary.turnId] ??
                        "?";
                      return (
                        <DropdownMenuItem
                          key={summary.turnId}
                          onClick={() => selectTurn(summary.turnId)}
                        >
                          <CheckIcon
                            className={cn(
                              "size-3.5",
                              selectedDiffSelectionKind === "turn" &&
                                summary.turnId === selectedTurn?.turnId
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate">Turn {turnCount}</span>
                          <span className="shrink-0 text-muted-foreground text-xs">
                            {formatShortTimestamp(summary.completedAt, settings.timestampFormat)}
                          </span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
        <Toggle
          aria-label={
            diffRenderMode === "stacked"
              ? "Switch to split diff view"
              : "Switch to stacked diff view"
          }
          title={diffRenderMode === "stacked" ? "Switch to split view" : "Switch to stacked view"}
          variant="outline"
          size="xs"
          pressed={diffRenderMode === "split"}
          onPressedChange={() => {
            setDiffRenderMode((current) => (current === "stacked" ? "split" : "stacked"));
          }}
        >
          {diffRenderMode === "stacked" ? (
            <Columns2Icon className="size-3" />
          ) : (
            <Rows3Icon className="size-3" />
          )}
        </Toggle>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="Diff actions"
                size="icon-xs"
                title="Diff actions"
                variant="outline"
              />
            }
          >
            <EllipsisVerticalIcon className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={refreshDiff}>
              <RefreshCwIcon className="size-3.5" />
              Refresh
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={renderableFiles.length === 0}
              onClick={() => {
                setCollapsedDiffFiles(() =>
                  allDiffsCollapsed
                    ? new Set()
                    : new Set(renderableFiles.map((fileDiff) => resolveFileDiffPath(fileDiff))),
                );
              }}
            >
              {allDiffsCollapsed ? (
                <Maximize2Icon className="size-3.5" />
              ) : (
                <Minimize2Icon className="size-3.5" />
              )}
              {allDiffsCollapsed ? "Expand all diffs" : "Collapse all diffs"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setDiffWordWrap((current) => !current);
              }}
            >
              <TextWrapIcon className="size-3.5" />
              {diffWordWrap ? "Disable line wrapping" : "Enable line wrapping"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );

  return (
    <DiffPanelShell mode={mode} header={headerRow}>
      {!activeThread ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          Select a thread to inspect turn diffs.
        </div>
      ) : !isGitRepo ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          Diffs are unavailable because this project is not a git repository.
        </div>
      ) : !selectedDiffScope && orderedTurnDiffSummaries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          No completed turns yet.
        </div>
      ) : (
        <>
          <div
            ref={patchViewportRef}
            className="diff-panel-viewport min-h-0 min-w-0 flex-1 overflow-hidden"
          >
            {checkpointDiffError && !renderablePatch && (
              <div className="px-3">
                <p className="mb-2 text-[11px] text-red-500/80">{checkpointDiffError}</p>
              </div>
            )}
            {!renderablePatch ? (
              isLoadingCheckpointDiff ? (
                <DiffPanelLoadingState label="Loading diff..." />
              ) : (
                <div className="flex h-full items-center justify-center px-3 py-2 text-xs text-muted-foreground/70">
                  <p>
                    {hasNoNetChanges
                      ? "No net changes in this selection."
                      : "No patch available for this selection."}
                  </p>
                </div>
              )
            ) : renderablePatch.kind === "files" ? (
              <Virtualizer
                className="diff-render-surface h-full min-h-0 overflow-auto px-2 pb-2"
                config={{
                  overscrollSize: 600,
                  intersectionObserverMargin: 1200,
                }}
              >
                {renderableFiles.map((fileDiff) => {
                  const filePath = resolveFileDiffPath(fileDiff);
                  const fileKey = buildFileDiffRenderKey(fileDiff);
                  const themedFileKey = `${fileKey}:${resolvedTheme}`;
                  const fileCollapsed = collapsedDiffFiles.has(filePath);
                  return (
                    <div
                      key={themedFileKey}
                      data-diff-file-path={filePath}
                      className="diff-render-file mb-2 overflow-hidden rounded-md border border-border/70 bg-background/60 first:mt-2 last:mb-0"
                    >
                      <div className="flex min-h-9 items-center gap-1 border-b border-border/70 bg-card/80 px-1.5">
                        <button
                          type="button"
                          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          aria-label={fileCollapsed ? "Expand diff" : "Collapse diff"}
                          aria-expanded={!fileCollapsed}
                          onClick={() => toggleDiffFileCollapsed(filePath)}
                        >
                          {fileCollapsed ? (
                            <ChevronRightIcon className="size-3.5" />
                          ) : (
                            <ChevronDownIcon className="size-3.5" />
                          )}
                        </button>
                        <div className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1 font-mono text-[11px] text-foreground/85">
                          <FileCode2Icon className="size-3.5 shrink-0 text-muted-foreground" />
                          <button
                            type="button"
                            className="min-w-0 cursor-pointer truncate rounded-sm text-left underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                            title={filePath}
                            onClick={() => openDiffFileInPanel(filePath)}
                          >
                            {filePath}
                          </button>
                        </div>
                      </div>
                      {fileCollapsed ? null : (
                        <FileDiff
                          fileDiff={fileDiff}
                          options={{
                            diffStyle: diffRenderMode === "split" ? "split" : "unified",
                            lineDiffType: "none",
                            overflow: diffWordWrap ? "wrap" : "scroll",
                            theme: resolveDiffThemeName(resolvedTheme),
                            themeType: resolvedTheme as DiffThemeType,
                            unsafeCSS: DIFF_PANEL_UNSAFE_CSS,
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </Virtualizer>
            ) : (
              <div className="h-full overflow-auto p-2">
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground/75">{renderablePatch.reason}</p>
                  <pre
                    className={cn(
                      "max-h-[72vh] rounded-md border border-border/70 bg-background/70 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground/90",
                      diffWordWrap
                        ? "overflow-auto whitespace-pre-wrap wrap-break-word"
                        : "overflow-auto",
                    )}
                  >
                    {renderablePatch.text}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </DiffPanelShell>
  );
}
