import { createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import ChatView from "../components/ChatView";
import { threadHasStarted } from "../components/ChatView.logic";
import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import {
  DiffPanelHeaderSkeleton,
  DiffPanelLoadingState,
  DiffPanelShell,
  type DiffPanelMode,
} from "../components/DiffPanelShell";
import { finalizePromotedDraftThreadByRef, useComposerDraftStore } from "../composerDraftStore";
import {
  encodeFileSidePanelTabId,
  encodeSidePanelTabs,
  type DiffRouteSearch,
  parseDiffRouteSearch,
  parseSidePanelTabs,
  resolveNextSidePanelTab,
  SIDE_PANEL_BROWSER_TAB_ID,
  SIDE_PANEL_REVIEW_TAB_ID,
  SIDE_PANEL_SUMMARY_TAB_ID,
  stripDiffSearchParams,
  type SidePanelTabId,
} from "../diffRouteSearch";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "../rightPanelLayout";
import { selectEnvironmentState, selectThreadExistsByRef, useStore } from "../store";
import { createThreadSelectorByRef } from "../storeSelectors";
import { resolveThreadRouteRef, buildThreadRouteParams } from "../threadRoutes";
import { RightPanelSheet } from "../components/RightPanelSheet";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "~/components/ui/sidebar";
import { selectProjectByRef } from "../store";
import { scopeProjectRef } from "@t3tools/client-runtime";
import { Schema } from "effect";
import { useServerAvailableEditors } from "~/rpc/serverState";
import { getLocalStorageItem } from "~/hooks/useLocalStorage";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { ThreadSidePanel } from "../components/ThreadSidePanel";

const DiffPanel = lazy(() => import("../components/DiffPanel"));
const FileTreePanel = lazy(() => import("../components/FileTreePanel"));
const DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_diff_sidebar_width";
const SIDE_PANEL_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_side_panel_sidebar_width";
const FILE_TREE_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_file_tree_sidebar_width";
const RIGHT_PANEL_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_right_panel_sidebar_width";
const SIDE_PANEL_INLINE_DEFAULT_WIDTH = "clamp(32rem,52vw,50rem)";
const FILE_TREE_INLINE_DEFAULT_WIDTH = "clamp(20rem,32vw,28rem)";
const SIDE_PANEL_INLINE_SIDEBAR_MIN_WIDTH = 22 * 16;
const FILE_TREE_INLINE_SIDEBAR_MIN_WIDTH = 18 * 16;
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;
const CHAT_HEADER_HEIGHT = "52px";

function getStoredInlineSidebarWidth(storageKey: string): number | null {
  try {
    return getLocalStorageItem(storageKey, Schema.Finite);
  } catch {
    return null;
  }
}

function getInitialInlineSidebarWidth(input: {
  defaultWidth: string;
  fallbackStorageKey?: string;
  minWidth: number;
  storageKey: string;
}) {
  if (typeof window === "undefined") {
    return input.defaultWidth;
  }

  const storedWidth =
    getStoredInlineSidebarWidth(input.storageKey) ??
    (input.fallbackStorageKey ? getStoredInlineSidebarWidth(input.fallbackStorageKey) : null) ??
    getStoredInlineSidebarWidth(RIGHT_PANEL_INLINE_SIDEBAR_WIDTH_STORAGE_KEY);
  return storedWidth === null ? input.defaultWidth : `${Math.max(input.minWidth, storedWidth)}px`;
}

function parsePixelWidth(width: string) {
  const trimmedWidth = width.trim();
  if (!trimmedWidth.endsWith("px")) {
    return null;
  }
  const parsedWidth = Number.parseFloat(trimmedWidth);
  return Number.isFinite(parsedWidth) ? parsedWidth : null;
}

type InlineRightPanel = "side-panel" | "file-tree";

function readInlineRightPanelWidth(panel: InlineRightPanel) {
  if (typeof window === "undefined") {
    return null;
  }
  const container = document.querySelector<HTMLElement>(
    `[data-inline-right-panel="${panel}"] [data-slot='sidebar-container']`,
  );
  const width = container?.getBoundingClientRect().width ?? null;
  return width !== null && Number.isFinite(width) ? width : null;
}

function readChatInsetLeftOffset() {
  if (typeof window === "undefined") {
    return 0;
  }
  const inset = document.querySelector<HTMLElement>("[data-slot='sidebar-inset']");
  const left = inset?.getBoundingClientRect().left ?? 0;
  return Number.isFinite(left) ? Math.max(0, Math.round(left)) : 0;
}

function getInlineRightPanelElement(panel: InlineRightPanel) {
  if (typeof window === "undefined") {
    return null;
  }
  return document.querySelector<HTMLElement>(`[data-inline-right-panel="${panel}"]`);
}

function applyInlineRightPanelWidth(panel: InlineRightPanel, width: number) {
  getInlineRightPanelElement(panel)?.style.setProperty("--sidebar-width", formatPixelWidth(width));
}

function setInlineRightPanelTransitionDuration(panel: InlineRightPanel, duration: string | null) {
  const element = getInlineRightPanelElement(panel);
  const targets = [
    element?.querySelector<HTMLElement>("[data-slot='sidebar-gap']"),
    element?.querySelector<HTMLElement>("[data-slot='sidebar-container']"),
  ].filter((target): target is HTMLElement => target !== undefined && target !== null);
  for (const target of targets) {
    if (duration === null) {
      target.style.removeProperty("transition-duration");
    } else {
      target.style.setProperty("transition-duration", duration);
    }
  }
}

function applySidePanelRightOffset(offset: number) {
  getInlineRightPanelElement("side-panel")
    ?.querySelector<HTMLElement>("[data-slot='sidebar-container']")
    ?.style.setProperty("--sidebar-fixed-right-offset", formatPixelWidth(offset));
}

function formatPixelWidth(width: number) {
  return `${width}px`;
}

const DiffLoadingFallback = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffPanelShell mode={props.mode} header={<DiffPanelHeaderSkeleton />}>
      <DiffPanelLoadingState label="Loading diff viewer..." />
    </DiffPanelShell>
  );
};

const LazyDiffPanel = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffWorkerPoolProvider>
      <Suspense fallback={<DiffLoadingFallback mode={props.mode} />}>
        <DiffPanel mode={props.mode} />
      </Suspense>
    </DiffWorkerPoolProvider>
  );
};

const FileTreeLoadingFallback = () => (
  <div className="flex h-full min-w-0 flex-col bg-background">
    <div className="border-b border-border px-3 py-3">
      <div className="h-7 w-28 rounded-md bg-muted" />
      <div className="mt-2 h-7 rounded-md bg-muted" />
    </div>
    <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground/70">
      Loading file tree...
    </div>
  </div>
);

const LazyFileTreePanel = (props: React.ComponentProps<typeof FileTreePanel>) => {
  return (
    <Suspense fallback={<FileTreeLoadingFallback />}>
      <FileTreePanel {...props} />
    </Suspense>
  );
};

const ThreadSidePanelInlineSidebar = (props: {
  activeTabId: SidePanelTabId;
  bottomInset: string;
  cwd: string | null;
  environmentId: EnvironmentId;
  fixedRightOffset: string;
  onCloseSidePanel: () => void;
  onCloseTab: (tabId: SidePanelTabId) => void;
  onExpandedChange: (expanded: boolean) => void;
  onOpenBrowser: () => void;
  onOpenFile: (relativePath: string) => void;
  onOpenReview: () => void;
  onOpenSidePanel: () => void;
  onResizeSidePanel: (width: number) => void;
  onSelectTab: (tabId: SidePanelTabId) => void;
  renderReviewContent: boolean;
  sidePanelExpanded: boolean;
  sidePanelExpandedLeftOffset: number;
  sidePanelOpen: boolean;
  summaryContent: React.ReactNode;
  tabIds: ReadonlyArray<SidePanelTabId>;
  threadKey: string;
  width: string;
}) => {
  const {
    activeTabId,
    bottomInset,
    cwd,
    environmentId,
    fixedRightOffset,
    onCloseSidePanel,
    onCloseTab,
    onExpandedChange,
    onOpenBrowser,
    onOpenFile,
    onOpenReview,
    onOpenSidePanel,
    onResizeSidePanel,
    onSelectTab,
    renderReviewContent,
    sidePanelExpanded,
    sidePanelExpandedLeftOffset,
    sidePanelOpen,
    summaryContent,
    tabIds,
    threadKey,
    width,
  } = props;
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onOpenSidePanel();
        return;
      }
      onCloseSidePanel();
    },
    [onCloseSidePanel, onOpenSidePanel],
  );
  const shouldAcceptInlineSidebarWidth = useCallback(
    ({ currentWidth, nextWidth }: { currentWidth: number; nextWidth: number }) => {
      if (nextWidth <= currentWidth) return true;

      const composerForm = document.querySelector<HTMLElement>("[data-chat-composer-form='true']");
      if (!composerForm) return true;
      const composerViewport = composerForm.parentElement;
      if (!composerViewport) return true;

      const viewportStyle = window.getComputedStyle(composerViewport);
      const viewportPaddingLeft = Number.parseFloat(viewportStyle.paddingLeft) || 0;
      const viewportPaddingRight = Number.parseFloat(viewportStyle.paddingRight) || 0;
      const currentViewportContentWidth = Math.max(
        0,
        composerViewport.clientWidth - viewportPaddingLeft - viewportPaddingRight,
      );
      const projectedViewportContentWidth = Math.max(
        0,
        currentViewportContentWidth - (nextWidth - currentWidth),
      );
      const composerFooter = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-footer='true']",
      );
      const composerRightActions = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-actions='right']",
      );
      const composerRightActionsWidth = composerRightActions?.getBoundingClientRect().width ?? 0;
      const composerFooterGap = composerFooter
        ? Number.parseFloat(window.getComputedStyle(composerFooter).columnGap) ||
          Number.parseFloat(window.getComputedStyle(composerFooter).gap) ||
          0
        : 0;
      const minimumComposerWidth =
        COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX + composerRightActionsWidth + composerFooterGap;

      return projectedViewportContentWidth >= minimumComposerWidth;
    },
    [],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      open={sidePanelOpen}
      onOpenChange={onOpenChange}
      className="w-auto min-h-0 flex-none bg-transparent [&_[data-slot=sidebar-gap]]:hidden"
      data-inline-right-panel="side-panel"
      style={
        {
          "--sidebar-width": sidePanelExpanded
            ? `calc(100vw - ${formatPixelWidth(sidePanelExpandedLeftOffset)} - ${fixedRightOffset})`
            : width,
        } as React.CSSProperties
      }
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-border bg-card text-foreground"
        style={
          {
            "--sidebar-fixed-right-offset": fixedRightOffset,
            top: CHAT_HEADER_HEIGHT,
            height: `calc(100svh - ${CHAT_HEADER_HEIGHT} - ${bottomInset})`,
          } as React.CSSProperties
        }
        {...(sidePanelExpanded
          ? {}
          : {
              resizable: {
                minWidth: SIDE_PANEL_INLINE_SIDEBAR_MIN_WIDTH,
                onResize: onResizeSidePanel,
                shouldAcceptWidth: shouldAcceptInlineSidebarWidth,
                storageKey: SIDE_PANEL_INLINE_SIDEBAR_WIDTH_STORAGE_KEY,
              },
            })}
      >
        <ThreadSidePanel
          activeTabId={activeTabId}
          browserPanelId={`thread-browser:${threadKey}`}
          cwd={cwd}
          environmentId={environmentId}
          expanded={sidePanelExpanded}
          tabIds={tabIds}
          onCloseTab={onCloseTab}
          onExpandedChange={onExpandedChange}
          onOpenBrowser={onOpenBrowser}
          onOpenFile={onOpenFile}
          onOpenReview={onOpenReview}
          onSelectTab={onSelectTab}
          reviewContent={renderReviewContent ? <LazyDiffPanel mode="sidebar" /> : null}
          summaryContent={summaryContent}
        />
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
};

const FileTreePanelInlineSidebar = (props: {
  bottomInset: string;
  fileTreeOpen: boolean;
  onCloseFileTree: () => void;
  onOpenFileTree: () => void;
  onResizeFileTree: (width: number) => void;
  width: string;
  children: React.ReactNode;
}) => {
  const {
    bottomInset,
    fileTreeOpen,
    onCloseFileTree,
    onOpenFileTree,
    onResizeFileTree,
    width,
    children,
  } = props;
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onOpenFileTree();
        return;
      }
      onCloseFileTree();
    },
    [onCloseFileTree, onOpenFileTree],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      open={fileTreeOpen}
      onOpenChange={onOpenChange}
      className="w-auto min-h-0 flex-none bg-transparent [&_[data-slot=sidebar-gap]]:hidden"
      data-inline-right-panel="file-tree"
      style={{ "--sidebar-width": width } as React.CSSProperties}
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-border bg-card text-foreground"
        style={
          {
            top: CHAT_HEADER_HEIGHT,
            height: `calc(100svh - ${CHAT_HEADER_HEIGHT} - ${bottomInset})`,
          } as React.CSSProperties
        }
        resizable={{
          minWidth: FILE_TREE_INLINE_SIDEBAR_MIN_WIDTH,
          onResize: onResizeFileTree,
          storageKey: FILE_TREE_INLINE_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        {children}
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
};

function ChatThreadRouteView() {
  const navigate = useNavigate();
  const threadRef = Route.useParams({
    select: (params) => resolveThreadRouteRef(params),
  });
  const search = Route.useSearch();
  const bootstrapComplete = useStore(
    (store) => selectEnvironmentState(store, threadRef?.environmentId ?? null).bootstrapComplete,
  );
  const serverThread = useStore(useMemo(() => createThreadSelectorByRef(threadRef), [threadRef]));
  const draftThread = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) : null,
  );
  const activeProject = useStore((store) => {
    const projectRef = serverThread
      ? scopeProjectRef(serverThread.environmentId, serverThread.projectId)
      : draftThread
        ? scopeProjectRef(draftThread.environmentId, draftThread.projectId)
        : null;
    return projectRef ? selectProjectByRef(store, projectRef) : undefined;
  });
  const activeCwd =
    serverThread?.worktreePath ?? draftThread?.worktreePath ?? activeProject?.cwd ?? null;
  const [planSummaryContent, setPlanSummaryContent] = useState<React.ReactNode | null>(null);
  const availableEditors = useServerAvailableEditors();
  const threadExists = useStore((store) => selectThreadExistsByRef(store, threadRef));
  const environmentHasServerThreads = useStore(
    (store) => selectEnvironmentState(store, threadRef?.environmentId ?? null).threadIds.length > 0,
  );
  const draftThreadExists = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) !== null : false,
  );
  const environmentHasDraftThreads = useComposerDraftStore((store) => {
    if (!threadRef) {
      return false;
    }
    return store.hasDraftThreadsInEnvironment(threadRef.environmentId);
  });
  const routeThreadExists = threadExists || draftThreadExists;
  const serverThreadStarted = threadHasStarted(serverThread);
  const environmentHasAnyThreads = environmentHasServerThreads || environmentHasDraftThreads;
  const sidePanelOpen = search.sidePanel === "1";
  const sidePanelExpanded = sidePanelOpen && search.sidePanelExpanded === "1";
  const sidePanelDynamicTabs = parseSidePanelTabs(search.sidePanelTabs);
  const sidePanelTabIds = useMemo<SidePanelTabId[]>(
    () => [SIDE_PANEL_SUMMARY_TAB_ID, ...sidePanelDynamicTabs],
    [sidePanelDynamicTabs],
  );
  const activeSidePanelTabId =
    search.sidePanelTab && sidePanelTabIds.includes(search.sidePanelTab)
      ? search.sidePanelTab
      : SIDE_PANEL_SUMMARY_TAB_ID;
  const reviewTabOpen = sidePanelTabIds.includes(SIDE_PANEL_REVIEW_TAB_ID);
  const fileTreeOpen = search.fileTree === "1";
  const terminalOpen = useTerminalStateStore(
    (state) => selectThreadTerminalState(state.terminalStateByThreadKey, threadRef).terminalOpen,
  );
  const terminalHeight = useTerminalStateStore(
    (state) => selectThreadTerminalState(state.terminalStateByThreadKey, threadRef).terminalHeight,
  );
  const [liveTerminalHeight, setLiveTerminalHeight] = useState<number | null>(null);
  const terminalBottomInset = terminalOpen
    ? formatPixelWidth(liveTerminalHeight ?? terminalHeight)
    : "0px";
  const shouldUseRightPanelSheet = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  const [sidePanelInlineSidebarWidth, setSidePanelInlineSidebarWidth] = useState(() =>
    getInitialInlineSidebarWidth({
      defaultWidth: SIDE_PANEL_INLINE_DEFAULT_WIDTH,
      fallbackStorageKey: DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY,
      minWidth: SIDE_PANEL_INLINE_SIDEBAR_MIN_WIDTH,
      storageKey: SIDE_PANEL_INLINE_SIDEBAR_WIDTH_STORAGE_KEY,
    }),
  );
  const [sidePanelExpandedLeftOffset, setSidePanelExpandedLeftOffset] = useState(() =>
    readChatInsetLeftOffset(),
  );
  const [fileTreeInlineSidebarWidth, setFileTreeInlineSidebarWidth] = useState(() =>
    getInitialInlineSidebarWidth({
      defaultWidth: FILE_TREE_INLINE_DEFAULT_WIDTH,
      minWidth: FILE_TREE_INLINE_SIDEBAR_MIN_WIDTH,
      storageKey: FILE_TREE_INLINE_SIDEBAR_WIDTH_STORAGE_KEY,
    }),
  );
  const combinedRightPanelResizeTotalRef = useRef<number | null>(null);
  const combinedRightPanelResizeResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const currentThreadKey = threadRef ? `${threadRef.environmentId}:${threadRef.threadId}` : null;
  const [diffPanelMountState, setDiffPanelMountState] = useState(() => ({
    threadKey: currentThreadKey,
    hasOpenedDiff: reviewTabOpen,
  }));
  const hasOpenedDiff =
    diffPanelMountState.threadKey === currentThreadKey
      ? diffPanelMountState.hasOpenedDiff
      : reviewTabOpen;
  const markDiffOpened = useCallback(() => {
    setDiffPanelMountState((previous) => {
      if (previous.threadKey === currentThreadKey && previous.hasOpenedDiff) {
        return previous;
      }
      return {
        threadKey: currentThreadKey,
        hasOpenedDiff: true,
      };
    });
  }, [currentThreadKey]);
  const updateSidePanelSearch = useCallback(
    (input: {
      open: boolean;
      activeTabId: SidePanelTabId;
      expanded?: boolean;
      tabIds: ReadonlyArray<SidePanelTabId>;
    }) => {
      if (!threadRef) {
        return;
      }
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
        search: (previous) => {
          const previousExpanded = previous.sidePanelExpanded === "1";
          const rest = stripDiffSearchParams(previous);
          return {
            ...rest,
            sidePanel: input.open ? "1" : undefined,
            sidePanelExpanded: input.open && (input.expanded ?? previousExpanded) ? "1" : undefined,
            sidePanelTab: input.open ? input.activeTabId : undefined,
            sidePanelTabs: input.open ? encodeSidePanelTabs(input.tabIds) : undefined,
          };
        },
      });
    },
    [navigate, threadRef],
  );
  const openSidePanelTab = useCallback(
    (tabId: SidePanelTabId) => {
      const nextTabs = sidePanelTabIds.includes(tabId)
        ? sidePanelTabIds
        : [...sidePanelTabIds, tabId];
      updateSidePanelSearch({ open: true, activeTabId: tabId, tabIds: nextTabs });
    },
    [sidePanelTabIds, updateSidePanelSearch],
  );
  const closeSidePanel = useCallback(() => {
    if (!threadRef) {
      return;
    }
    updateSidePanelSearch({
      open: false,
      activeTabId: activeSidePanelTabId,
      tabIds: sidePanelTabIds,
    });
  }, [activeSidePanelTabId, sidePanelTabIds, threadRef, updateSidePanelSearch]);
  const openSidePanel = useCallback(() => {
    updateSidePanelSearch({
      open: true,
      activeTabId: activeSidePanelTabId,
      tabIds: sidePanelTabIds,
    });
  }, [activeSidePanelTabId, sidePanelTabIds, updateSidePanelSearch]);
  const updateSidePanelExpanded = useCallback(
    (expanded: boolean) => {
      updateSidePanelSearch({
        open: true,
        activeTabId: activeSidePanelTabId,
        expanded,
        tabIds: sidePanelTabIds,
      });
    },
    [activeSidePanelTabId, sidePanelTabIds, updateSidePanelSearch],
  );
  const openReview = useCallback(() => {
    markDiffOpened();
    openSidePanelTab(SIDE_PANEL_REVIEW_TAB_ID);
  }, [markDiffOpened, openSidePanelTab]);
  const openSummary = useCallback(() => {
    openSidePanelTab(SIDE_PANEL_SUMMARY_TAB_ID);
  }, [openSidePanelTab]);
  const openBrowser = useCallback(() => {
    openSidePanelTab(SIDE_PANEL_BROWSER_TAB_ID);
  }, [openSidePanelTab]);
  const openFile = useCallback(
    (relativePath: string) => {
      openSidePanelTab(encodeFileSidePanelTabId(relativePath));
    },
    [openSidePanelTab],
  );
  const selectSidePanelTab = useCallback(
    (tabId: SidePanelTabId) => {
      updateSidePanelSearch({ open: true, activeTabId: tabId, tabIds: sidePanelTabIds });
    },
    [sidePanelTabIds, updateSidePanelSearch],
  );
  const closeSidePanelTab = useCallback(
    (tabId: SidePanelTabId) => {
      if (tabId === SIDE_PANEL_SUMMARY_TAB_ID) return;
      const nextTabs = sidePanelTabIds.filter((candidate) => candidate !== tabId);
      const nextActiveTabId = resolveNextSidePanelTab({
        closingTabId: tabId,
        activeTabId: activeSidePanelTabId,
        tabIds: sidePanelTabIds,
      });
      updateSidePanelSearch({
        open: true,
        activeTabId: nextTabs.includes(nextActiveTabId)
          ? nextActiveTabId
          : SIDE_PANEL_SUMMARY_TAB_ID,
        tabIds: nextTabs,
      });
    },
    [activeSidePanelTabId, sidePanelTabIds, updateSidePanelSearch],
  );
  const closeFileTree = useCallback(() => {
    if (!threadRef) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: (previous) => ({ ...previous, fileTree: undefined }),
    });
  }, [navigate, threadRef]);
  const openFileTree = useCallback(() => {
    if (!threadRef) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: (previous) => ({ ...previous, fileTree: "1" }),
    });
  }, [navigate, threadRef]);
  const scheduleCombinedRightPanelResizeReset = useCallback(() => {
    if (combinedRightPanelResizeResetTimeoutRef.current !== null) {
      clearTimeout(combinedRightPanelResizeResetTimeoutRef.current);
    }
    combinedRightPanelResizeResetTimeoutRef.current = setTimeout(() => {
      combinedRightPanelResizeTotalRef.current = null;
      combinedRightPanelResizeResetTimeoutRef.current = null;
      setInlineRightPanelTransitionDuration("side-panel", null);
    }, 180);
  }, []);
  const updateSidePanelInlineSidebarWidth = useCallback((width: number) => {
    combinedRightPanelResizeTotalRef.current = null;
    if (combinedRightPanelResizeResetTimeoutRef.current !== null) {
      clearTimeout(combinedRightPanelResizeResetTimeoutRef.current);
      combinedRightPanelResizeResetTimeoutRef.current = null;
    }
    setSidePanelInlineSidebarWidth(
      formatPixelWidth(Math.max(SIDE_PANEL_INLINE_SIDEBAR_MIN_WIDTH, width)),
    );
  }, []);
  const updateFileTreeInlineSidebarWidth = useCallback(
    (width: number) => {
      const requestedFileTreeWidth = Math.max(FILE_TREE_INLINE_SIDEBAR_MIN_WIDTH, width);
      if (sidePanelOpen && fileTreeOpen) {
        const currentSidePanelWidth =
          parsePixelWidth(sidePanelInlineSidebarWidth) ??
          readInlineRightPanelWidth("side-panel") ??
          SIDE_PANEL_INLINE_SIDEBAR_MIN_WIDTH;
        const currentFileTreeWidth =
          parsePixelWidth(fileTreeInlineSidebarWidth) ??
          readInlineRightPanelWidth("file-tree") ??
          requestedFileTreeWidth;
        const combinedWidth =
          combinedRightPanelResizeTotalRef.current ?? currentSidePanelWidth + currentFileTreeWidth;
        combinedRightPanelResizeTotalRef.current = combinedWidth;

        const maximumFileTreeWidth = Math.max(
          FILE_TREE_INLINE_SIDEBAR_MIN_WIDTH,
          combinedWidth - SIDE_PANEL_INLINE_SIDEBAR_MIN_WIDTH,
        );
        const nextFileTreeWidth = Math.min(requestedFileTreeWidth, maximumFileTreeWidth);
        const nextSidePanelWidth = Math.max(
          SIDE_PANEL_INLINE_SIDEBAR_MIN_WIDTH,
          combinedWidth - nextFileTreeWidth,
        );

        scheduleCombinedRightPanelResizeReset();
        setInlineRightPanelTransitionDuration("side-panel", "0ms");
        applyInlineRightPanelWidth("side-panel", nextSidePanelWidth);
        applyInlineRightPanelWidth("file-tree", nextFileTreeWidth);
        applySidePanelRightOffset(nextFileTreeWidth);
        setFileTreeInlineSidebarWidth(formatPixelWidth(nextFileTreeWidth));
        setSidePanelInlineSidebarWidth(formatPixelWidth(nextSidePanelWidth));
        return;
      }

      combinedRightPanelResizeTotalRef.current = null;
      setFileTreeInlineSidebarWidth(formatPixelWidth(requestedFileTreeWidth));
    },
    [
      fileTreeInlineSidebarWidth,
      fileTreeOpen,
      scheduleCombinedRightPanelResizeReset,
      sidePanelInlineSidebarWidth,
      sidePanelOpen,
    ],
  );
  const addPathMentionToDraft = useCallback(
    (_kind: "file" | "directory", path: string) => {
      if (!threadRef) {
        return;
      }
      const store = useComposerDraftStore.getState();
      const currentPrompt = store.getComposerDraft(threadRef)?.prompt ?? "";
      const mention = `@${path} `;
      const separator = currentPrompt.length === 0 || /\s$/.test(currentPrompt) ? "" : " ";
      store.setPrompt(threadRef, `${currentPrompt}${separator}${mention}`);
      window.dispatchEvent(new Event("t3code:composer-focus-request"));
    },
    [threadRef],
  );

  useEffect(() => {
    setLiveTerminalHeight(null);
  }, [currentThreadKey, terminalOpen]);

  useLayoutEffect(() => {
    if (!sidePanelExpanded) {
      return;
    }

    const updateLeftOffset = () => {
      setSidePanelExpandedLeftOffset(readChatInsetLeftOffset());
    };
    updateLeftOffset();
    window.addEventListener("resize", updateLeftOffset);
    const inset = document.querySelector<HTMLElement>("[data-slot='sidebar-inset']");
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateLeftOffset);
    if (inset) {
      resizeObserver?.observe(inset);
    }
    return () => {
      window.removeEventListener("resize", updateLeftOffset);
      resizeObserver?.disconnect();
    };
  }, [sidePanelExpanded]);

  useEffect(() => {
    if (!threadRef || !bootstrapComplete) {
      return;
    }

    if (!routeThreadExists && environmentHasAnyThreads) {
      void navigate({ to: "/", replace: true });
    }
  }, [bootstrapComplete, environmentHasAnyThreads, navigate, routeThreadExists, threadRef]);

  useEffect(() => {
    return () => {
      if (combinedRightPanelResizeResetTimeoutRef.current !== null) {
        clearTimeout(combinedRightPanelResizeResetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!threadRef || !serverThreadStarted || !draftThread?.promotedTo) {
      return;
    }
    finalizePromotedDraftThreadByRef(threadRef);
  }, [draftThread?.promotedTo, serverThreadStarted, threadRef]);

  if (!threadRef || !bootstrapComplete || !routeThreadExists) {
    return null;
  }

  const shouldRenderDiffContent = reviewTabOpen || hasOpenedDiff;
  const fileTreeContent = threadRef ? (
    <LazyFileTreePanel
      mode={shouldUseRightPanelSheet ? "sheet" : "sidebar"}
      environmentId={threadRef.environmentId}
      cwd={activeCwd}
      availableEditors={availableEditors}
      onClose={closeFileTree}
      onOpenFileInPanel={openFile}
      onAddPathMention={addPathMentionToDraft}
    />
  ) : null;
  const mainContentRightInset = sidePanelExpanded
    ? undefined
    : sidePanelOpen && fileTreeOpen
      ? `calc(${sidePanelInlineSidebarWidth} + ${fileTreeInlineSidebarWidth})`
      : sidePanelOpen
        ? sidePanelInlineSidebarWidth
        : fileTreeOpen
          ? fileTreeInlineSidebarWidth
          : undefined;

  if (!shouldUseRightPanelSheet) {
    return (
      <>
        <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
          <ChatView
            environmentId={threadRef.environmentId}
            threadId={threadRef.threadId}
            mainContentHidden={sidePanelExpanded}
            mainContentRightInset={mainContentRightInset}
            onDiffPanelOpen={openReview}
            onPlanPanelOpen={openSummary}
            onPlanPanelClose={closeSidePanel}
            onPlanSummaryContentChange={setPlanSummaryContent}
            onTerminalLiveHeightChange={setLiveTerminalHeight}
            reserveTitleBarControlInset={!sidePanelOpen && !fileTreeOpen}
            routeKind="server"
          />
        </SidebarInset>
        <ThreadSidePanelInlineSidebar
          activeTabId={activeSidePanelTabId}
          bottomInset={terminalBottomInset}
          cwd={activeCwd}
          environmentId={threadRef.environmentId}
          fixedRightOffset={fileTreeOpen ? fileTreeInlineSidebarWidth : "0px"}
          onCloseSidePanel={closeSidePanel}
          onCloseTab={closeSidePanelTab}
          onExpandedChange={updateSidePanelExpanded}
          onOpenBrowser={openBrowser}
          onOpenFile={openFile}
          onOpenReview={openReview}
          onOpenSidePanel={openSidePanel}
          onResizeSidePanel={updateSidePanelInlineSidebarWidth}
          onSelectTab={selectSidePanelTab}
          renderReviewContent={shouldRenderDiffContent}
          sidePanelExpanded={sidePanelExpanded}
          sidePanelExpandedLeftOffset={sidePanelExpandedLeftOffset}
          sidePanelOpen={sidePanelOpen}
          summaryContent={planSummaryContent}
          tabIds={sidePanelTabIds}
          threadKey={currentThreadKey ?? "unknown"}
          width={sidePanelInlineSidebarWidth}
        />
        <FileTreePanelInlineSidebar
          bottomInset={terminalBottomInset}
          fileTreeOpen={fileTreeOpen}
          onCloseFileTree={closeFileTree}
          onOpenFileTree={openFileTree}
          onResizeFileTree={updateFileTreeInlineSidebarWidth}
          width={fileTreeInlineSidebarWidth}
        >
          {fileTreeOpen ? fileTreeContent : null}
        </FileTreePanelInlineSidebar>
      </>
    );
  }

  return (
    <>
      <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
        <ChatView
          environmentId={threadRef.environmentId}
          threadId={threadRef.threadId}
          onDiffPanelOpen={openReview}
          onPlanPanelOpen={openSummary}
          onPlanPanelClose={closeSidePanel}
          onPlanSummaryContentChange={setPlanSummaryContent}
          onTerminalLiveHeightChange={setLiveTerminalHeight}
          routeKind="server"
        />
      </SidebarInset>
      <RightPanelSheet
        bottomInset={terminalBottomInset}
        open={sidePanelOpen}
        onClose={closeSidePanel}
      >
        <ThreadSidePanel
          activeTabId={activeSidePanelTabId}
          browserPanelId={`thread-browser:${currentThreadKey ?? "unknown"}`}
          cwd={activeCwd}
          environmentId={threadRef.environmentId}
          expanded={false}
          tabIds={sidePanelTabIds}
          onCloseTab={closeSidePanelTab}
          onOpenBrowser={openBrowser}
          onOpenFile={openFile}
          onOpenReview={openReview}
          onSelectTab={selectSidePanelTab}
          reviewContent={shouldRenderDiffContent ? <LazyDiffPanel mode="sheet" /> : null}
          summaryContent={planSummaryContent}
        />
      </RightPanelSheet>
      <RightPanelSheet
        bottomInset={terminalBottomInset}
        open={fileTreeOpen}
        onClose={closeFileTree}
      >
        {fileTreeOpen ? fileTreeContent : null}
      </RightPanelSheet>
    </>
  );
}

export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  search: {
    middlewares: [
      retainSearchParams<DiffRouteSearch>([
        "sidePanel",
        "sidePanelExpanded",
        "sidePanelTab",
        "sidePanelTabs",
        "diffTurnId",
        "diffFilePath",
        "diffScope",
        "fileTree",
      ]),
    ],
  },
  component: ChatThreadRouteView,
});
