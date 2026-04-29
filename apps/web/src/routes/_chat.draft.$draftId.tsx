import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { scopeProjectRef } from "@t3tools/client-runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { Schema } from "effect";
import ChatView from "../components/ChatView";
import { threadHasStarted } from "../components/ChatView.logic";
import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import {
  DiffPanelHeaderSkeleton,
  DiffPanelLoadingState,
  DiffPanelShell,
  type DiffPanelMode,
} from "../components/DiffPanelShell";
import { useComposerDraftStore, DraftId } from "../composerDraftStore";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "../components/ui/sidebar";
import { createThreadSelectorAcrossEnvironments } from "../storeSelectors";
import { selectProjectByRef, useStore } from "../store";
import { buildDraftThreadRouteParams, buildThreadRouteParams } from "../threadRoutes";
import { RightPanelSheet } from "../components/RightPanelSheet";
import {
  encodeFileSidePanelTabId,
  encodeSidePanelTabs,
  parseDiffRouteSearch,
  parseSidePanelTabs,
  resolveNextSidePanelTab,
  SIDE_PANEL_BROWSER_TAB_ID,
  SIDE_PANEL_REVIEW_TAB_ID,
  SIDE_PANEL_SUMMARY_TAB_ID,
  stripDiffSearchParams,
  type SidePanelTabId,
} from "../diffRouteSearch";
import { useServerAvailableEditors } from "~/rpc/serverState";
import { projectScriptCwd } from "@t3tools/shared/projectScripts";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { getLocalStorageItem } from "~/hooks/useLocalStorage";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "../rightPanelLayout";
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

function formatPixelWidth(width: number) {
  return `${width}px`;
}

function readChatInsetLeftOffset() {
  if (typeof window === "undefined") {
    return 0;
  }
  const inset = document.querySelector<HTMLElement>("[data-slot='sidebar-inset']");
  const left = inset?.getBoundingClientRect().left ?? 0;
  return Number.isFinite(left) ? Math.max(0, Math.round(left)) : 0;
}

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
  return storedWidth === null
    ? input.defaultWidth
    : formatPixelWidth(Math.max(input.minWidth, storedWidth));
}

const DiffLoadingFallback = (props: { mode: DiffPanelMode }) => (
  <DiffPanelShell mode={props.mode} header={<DiffPanelHeaderSkeleton />}>
    <DiffPanelLoadingState label="Loading diff viewer..." />
  </DiffPanelShell>
);

const LazyDiffPanel = (props: { mode: DiffPanelMode }) => (
  <DiffWorkerPoolProvider>
    <Suspense fallback={<DiffLoadingFallback mode={props.mode} />}>
      <DiffPanel mode={props.mode} />
    </Suspense>
  </DiffWorkerPoolProvider>
);

const FileTreeLoadingFallback = () => (
  <div className="flex h-full min-w-0 flex-col bg-background">
    <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
      <div className="h-4 w-24 rounded bg-muted" />
    </div>
    <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
      Loading file tree...
    </div>
  </div>
);

const LazyFileTreePanel = (props: React.ComponentProps<typeof FileTreePanel>) => (
  <Suspense fallback={<FileTreeLoadingFallback />}>
    <FileTreePanel {...props} />
  </Suspense>
);

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
          browserPanelId={`draft-browser:${threadKey}`}
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

function DraftChatThreadRouteView() {
  const navigate = useNavigate();
  const { draftId: rawDraftId } = Route.useParams();
  const draftId = DraftId.make(rawDraftId);
  const search = useSearch({
    strict: false,
    select: (params) => parseDiffRouteSearch(params),
  });
  const [planSummaryContent, setPlanSummaryContent] = useState<React.ReactNode | null>(null);
  const draftSession = useComposerDraftStore((store) => store.getDraftSession(draftId));
  const terminalThreadRef = useMemo(
    () =>
      draftSession
        ? {
            environmentId: draftSession.environmentId,
            threadId: draftSession.threadId,
          }
        : null,
    [draftSession],
  );
  const terminalOpen = useTerminalStateStore(
    (state) =>
      selectThreadTerminalState(state.terminalStateByThreadKey, terminalThreadRef).terminalOpen,
  );
  const terminalHeight = useTerminalStateStore(
    (state) =>
      selectThreadTerminalState(state.terminalStateByThreadKey, terminalThreadRef).terminalHeight,
  );
  const [liveTerminalHeight, setLiveTerminalHeight] = useState<number | null>(null);
  const terminalBottomInset = terminalOpen
    ? formatPixelWidth(liveTerminalHeight ?? terminalHeight)
    : "0px";
  const availableEditors = useServerAvailableEditors();
  const serverThread = useStore(
    useMemo(
      () => createThreadSelectorAcrossEnvironments(draftSession?.threadId ?? null),
      [draftSession?.threadId],
    ),
  );
  const activeProject = useStore((store) =>
    draftSession
      ? selectProjectByRef(
          store,
          scopeProjectRef(draftSession.environmentId, draftSession.projectId),
        )
      : undefined,
  );
  const serverThreadStarted = threadHasStarted(serverThread);
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
  const fileTreeCwd = activeProject
    ? projectScriptCwd({
        project: { cwd: activeProject.cwd },
        worktreePath: draftSession?.worktreePath ?? null,
      })
    : null;
  const updateSidePanelSearch = useCallback(
    (input: {
      open: boolean;
      activeTabId: SidePanelTabId;
      expanded?: boolean;
      tabIds: ReadonlyArray<SidePanelTabId>;
    }) => {
      void navigate({
        to: "/draft/$draftId",
        params: buildDraftThreadRouteParams(draftId),
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
    [draftId, navigate],
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
    updateSidePanelSearch({
      open: false,
      activeTabId: activeSidePanelTabId,
      tabIds: sidePanelTabIds,
    });
  }, [activeSidePanelTabId, sidePanelTabIds, updateSidePanelSearch]);
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
    openSidePanelTab(SIDE_PANEL_REVIEW_TAB_ID);
  }, [openSidePanelTab]);
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
    void navigate({
      to: "/draft/$draftId",
      params: buildDraftThreadRouteParams(draftId),
      search: (previous) => ({ ...previous, fileTree: undefined }),
    });
  }, [draftId, navigate]);
  const openFileTree = useCallback(() => {
    void navigate({
      to: "/draft/$draftId",
      params: buildDraftThreadRouteParams(draftId),
      search: (previous) => ({ ...previous, fileTree: "1" }),
    });
  }, [draftId, navigate]);
  const updateSidePanelInlineSidebarWidth = useCallback((width: number) => {
    setSidePanelInlineSidebarWidth(
      formatPixelWidth(Math.max(SIDE_PANEL_INLINE_SIDEBAR_MIN_WIDTH, width)),
    );
  }, []);
  const updateFileTreeInlineSidebarWidth = useCallback((width: number) => {
    setFileTreeInlineSidebarWidth(
      formatPixelWidth(Math.max(FILE_TREE_INLINE_SIDEBAR_MIN_WIDTH, width)),
    );
  }, []);
  const addPathMentionToDraft = useCallback(
    (_kind: "file" | "directory", path: string) => {
      const store = useComposerDraftStore.getState();
      const currentPrompt = store.getComposerDraft(draftId)?.prompt ?? "";
      const mention = `@${path} `;
      const separator = currentPrompt.length === 0 || /\s$/.test(currentPrompt) ? "" : " ";
      store.setPrompt(draftId, `${currentPrompt}${separator}${mention}`);
      window.dispatchEvent(new Event("t3code:composer-focus-request"));
    },
    [draftId],
  );
  const canonicalThreadRef = useMemo(
    () =>
      draftSession?.promotedTo
        ? serverThreadStarted
          ? draftSession.promotedTo
          : null
        : serverThread
          ? {
              environmentId: serverThread.environmentId,
              threadId: serverThread.id,
            }
          : null,
    [draftSession?.promotedTo, serverThread, serverThreadStarted],
  );
  const terminalThreadKey = terminalThreadRef
    ? `${terminalThreadRef.environmentId}:${terminalThreadRef.threadId}`
    : null;

  useEffect(() => {
    setLiveTerminalHeight(null);
  }, [terminalOpen, terminalThreadKey]);

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
    if (!canonicalThreadRef) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(canonicalThreadRef),
      replace: true,
    });
  }, [canonicalThreadRef, navigate]);

  useEffect(() => {
    if (draftSession || canonicalThreadRef) {
      return;
    }
    void navigate({ to: "/", replace: true });
  }, [canonicalThreadRef, draftSession, navigate]);

  if (canonicalThreadRef) {
    return (
      <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
        <ChatView
          environmentId={canonicalThreadRef.environmentId}
          threadId={canonicalThreadRef.threadId}
          onTerminalLiveHeightChange={setLiveTerminalHeight}
          routeKind="server"
        />
      </SidebarInset>
    );
  }

  if (!draftSession) {
    return null;
  }

  const fileTreeContent = (
    <LazyFileTreePanel
      mode={shouldUseRightPanelSheet ? "sheet" : "sidebar"}
      environmentId={draftSession.environmentId}
      cwd={fileTreeCwd}
      availableEditors={availableEditors}
      onClose={closeFileTree}
      onOpenFileInPanel={openFile}
      onAddPathMention={addPathMentionToDraft}
    />
  );
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
            draftId={draftId}
            environmentId={draftSession.environmentId}
            threadId={draftSession.threadId}
            mainContentHidden={sidePanelExpanded}
            mainContentRightInset={mainContentRightInset}
            onDiffPanelOpen={openReview}
            onPlanPanelOpen={openSummary}
            onPlanPanelClose={closeSidePanel}
            onPlanSummaryContentChange={setPlanSummaryContent}
            onTerminalLiveHeightChange={setLiveTerminalHeight}
            routeKind="draft"
          />
        </SidebarInset>
        <ThreadSidePanelInlineSidebar
          activeTabId={activeSidePanelTabId}
          bottomInset={terminalBottomInset}
          cwd={fileTreeCwd}
          environmentId={draftSession.environmentId}
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
          renderReviewContent={reviewTabOpen}
          sidePanelExpanded={sidePanelExpanded}
          sidePanelExpandedLeftOffset={sidePanelExpandedLeftOffset}
          sidePanelOpen={sidePanelOpen}
          summaryContent={planSummaryContent}
          tabIds={sidePanelTabIds}
          threadKey={`${draftSession.environmentId}:${draftSession.threadId}`}
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
          draftId={draftId}
          environmentId={draftSession.environmentId}
          threadId={draftSession.threadId}
          onDiffPanelOpen={openReview}
          onPlanPanelOpen={openSummary}
          onPlanPanelClose={closeSidePanel}
          onPlanSummaryContentChange={setPlanSummaryContent}
          onTerminalLiveHeightChange={setLiveTerminalHeight}
          routeKind="draft"
        />
      </SidebarInset>
      <RightPanelSheet
        bottomInset={terminalBottomInset}
        open={sidePanelOpen}
        onClose={closeSidePanel}
      >
        <ThreadSidePanel
          activeTabId={activeSidePanelTabId}
          browserPanelId={`draft-browser:${draftSession.environmentId}:${draftSession.threadId}`}
          cwd={fileTreeCwd}
          environmentId={draftSession.environmentId}
          expanded={false}
          tabIds={sidePanelTabIds}
          onCloseTab={closeSidePanelTab}
          onOpenBrowser={openBrowser}
          onOpenFile={openFile}
          onOpenReview={openReview}
          onSelectTab={selectSidePanelTab}
          reviewContent={reviewTabOpen ? <LazyDiffPanel mode="sheet" /> : null}
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

export const Route = createFileRoute("/_chat/draft/$draftId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  component: DraftChatThreadRouteView,
});
