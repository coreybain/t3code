import { createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  type DiffRouteSearch,
  parseDiffRouteSearch,
  stripDiffSearchParams,
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

const DiffPanel = lazy(() => import("../components/DiffPanel"));
const FileTreePanel = lazy(() => import("../components/FileTreePanel"));
const DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_diff_sidebar_width";
const FILE_TREE_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_file_tree_sidebar_width";
const RIGHT_PANEL_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_right_panel_sidebar_width";
const DIFF_INLINE_DEFAULT_WIDTH = "clamp(28rem,48vw,44rem)";
const FILE_TREE_INLINE_DEFAULT_WIDTH = "clamp(20rem,32vw,28rem)";
const DIFF_INLINE_SIDEBAR_MIN_WIDTH = 17 * 16;
const FILE_TREE_INLINE_SIDEBAR_MIN_WIDTH = 18 * 16;
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;

function getStoredInlineSidebarWidth(storageKey: string): number | null {
  try {
    return getLocalStorageItem(storageKey, Schema.Finite);
  } catch {
    return null;
  }
}

function getInitialInlineSidebarWidth(input: {
  defaultWidth: string;
  minWidth: number;
  storageKey: string;
}) {
  if (typeof window === "undefined") {
    return input.defaultWidth;
  }

  const storedWidth =
    getStoredInlineSidebarWidth(input.storageKey) ??
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

function readInlineRightPanelWidth(panel: "diff" | "file-tree") {
  if (typeof window === "undefined") {
    return null;
  }
  const container = document.querySelector<HTMLElement>(
    `[data-inline-right-panel="${panel}"] [data-slot='sidebar-container']`,
  );
  const width = container?.getBoundingClientRect().width ?? null;
  return width !== null && Number.isFinite(width) ? width : null;
}

function getInlineRightPanelElement(panel: "diff" | "file-tree") {
  if (typeof window === "undefined") {
    return null;
  }
  return document.querySelector<HTMLElement>(`[data-inline-right-panel="${panel}"]`);
}

function applyInlineRightPanelWidth(panel: "diff" | "file-tree", width: number) {
  getInlineRightPanelElement(panel)?.style.setProperty("--sidebar-width", formatPixelWidth(width));
}

function setInlineRightPanelTransitionDuration(
  panel: "diff" | "file-tree",
  duration: string | null,
) {
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

function applyDiffPanelRightOffset(offset: number) {
  getInlineRightPanelElement("diff")
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

const DiffPanelInlineSidebar = (props: {
  diffOpen: boolean;
  fixedRightOffset: string;
  onCloseDiff: () => void;
  onOpenDiff: () => void;
  onResizeDiffPanel: (width: number) => void;
  renderDiffContent: boolean;
  width: string;
}) => {
  const {
    diffOpen,
    fixedRightOffset,
    onCloseDiff,
    onOpenDiff,
    onResizeDiffPanel,
    renderDiffContent,
    width,
  } = props;
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onOpenDiff();
        return;
      }
      onCloseDiff();
    },
    [onCloseDiff, onOpenDiff],
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
      open={diffOpen}
      onOpenChange={onOpenChange}
      className="w-auto min-h-0 flex-none bg-transparent"
      data-inline-right-panel="diff"
      style={{ "--sidebar-width": width } as React.CSSProperties}
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-border bg-card text-foreground"
        style={{ "--sidebar-fixed-right-offset": fixedRightOffset } as React.CSSProperties}
        resizable={{
          minWidth: DIFF_INLINE_SIDEBAR_MIN_WIDTH,
          onResize: onResizeDiffPanel,
          shouldAcceptWidth: shouldAcceptInlineSidebarWidth,
          storageKey: DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        {renderDiffContent ? <LazyDiffPanel mode="sidebar" /> : null}
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
};

const FileTreePanelInlineSidebar = (props: {
  fileTreeOpen: boolean;
  onCloseFileTree: () => void;
  onOpenFileTree: () => void;
  onResizeFileTree: (width: number) => void;
  width: string;
  children: React.ReactNode;
}) => {
  const { fileTreeOpen, onCloseFileTree, onOpenFileTree, onResizeFileTree, width, children } =
    props;
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
      className="w-auto min-h-0 flex-none bg-transparent"
      data-inline-right-panel="file-tree"
      style={{ "--sidebar-width": width } as React.CSSProperties}
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-border bg-card text-foreground"
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
  const diffOpen = search.diff === "1";
  const fileTreeOpen = search.fileTree === "1";
  const shouldUseDiffSheet = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  const [diffInlineSidebarWidth, setDiffInlineSidebarWidth] = useState(() =>
    getInitialInlineSidebarWidth({
      defaultWidth: DIFF_INLINE_DEFAULT_WIDTH,
      minWidth: DIFF_INLINE_SIDEBAR_MIN_WIDTH,
      storageKey: DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY,
    }),
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
    hasOpenedDiff: diffOpen,
  }));
  const hasOpenedDiff =
    diffPanelMountState.threadKey === currentThreadKey
      ? diffPanelMountState.hasOpenedDiff
      : diffOpen;
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
  const closeDiff = useCallback(() => {
    if (!threadRef) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, diff: undefined };
      },
    });
  }, [navigate, threadRef]);
  const openDiff = useCallback(() => {
    if (!threadRef) {
      return;
    }
    markDiffOpened();
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, diff: "1" };
      },
    });
  }, [markDiffOpened, navigate, threadRef]);
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
  const openFileTreeFileDiff = useCallback(
    (filePath: string) => {
      if (!threadRef) {
        return;
      }
      markDiffOpened();
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
        search: (previous) => {
          const rest = stripDiffSearchParams(previous);
          return { ...rest, diff: "1", diffFilePath: filePath };
        },
      });
    },
    [markDiffOpened, navigate, threadRef],
  );
  const scheduleCombinedRightPanelResizeReset = useCallback(() => {
    if (combinedRightPanelResizeResetTimeoutRef.current !== null) {
      clearTimeout(combinedRightPanelResizeResetTimeoutRef.current);
    }
    combinedRightPanelResizeResetTimeoutRef.current = setTimeout(() => {
      combinedRightPanelResizeTotalRef.current = null;
      combinedRightPanelResizeResetTimeoutRef.current = null;
      setInlineRightPanelTransitionDuration("diff", null);
    }, 180);
  }, []);
  const updateDiffInlineSidebarWidth = useCallback((width: number) => {
    combinedRightPanelResizeTotalRef.current = null;
    if (combinedRightPanelResizeResetTimeoutRef.current !== null) {
      clearTimeout(combinedRightPanelResizeResetTimeoutRef.current);
      combinedRightPanelResizeResetTimeoutRef.current = null;
    }
    setDiffInlineSidebarWidth(formatPixelWidth(Math.max(DIFF_INLINE_SIDEBAR_MIN_WIDTH, width)));
  }, []);
  const updateFileTreeInlineSidebarWidth = useCallback(
    (width: number) => {
      const requestedFileTreeWidth = Math.max(FILE_TREE_INLINE_SIDEBAR_MIN_WIDTH, width);
      if (diffOpen && fileTreeOpen) {
        const currentDiffWidth =
          parsePixelWidth(diffInlineSidebarWidth) ??
          readInlineRightPanelWidth("diff") ??
          DIFF_INLINE_SIDEBAR_MIN_WIDTH;
        const currentFileTreeWidth =
          parsePixelWidth(fileTreeInlineSidebarWidth) ??
          readInlineRightPanelWidth("file-tree") ??
          requestedFileTreeWidth;
        const combinedWidth =
          combinedRightPanelResizeTotalRef.current ?? currentDiffWidth + currentFileTreeWidth;
        combinedRightPanelResizeTotalRef.current = combinedWidth;

        const maximumFileTreeWidth = Math.max(
          FILE_TREE_INLINE_SIDEBAR_MIN_WIDTH,
          combinedWidth - DIFF_INLINE_SIDEBAR_MIN_WIDTH,
        );
        const nextFileTreeWidth = Math.min(requestedFileTreeWidth, maximumFileTreeWidth);
        const nextDiffWidth = Math.max(
          DIFF_INLINE_SIDEBAR_MIN_WIDTH,
          combinedWidth - nextFileTreeWidth,
        );

        scheduleCombinedRightPanelResizeReset();
        setInlineRightPanelTransitionDuration("diff", "0ms");
        applyInlineRightPanelWidth("diff", nextDiffWidth);
        applyInlineRightPanelWidth("file-tree", nextFileTreeWidth);
        applyDiffPanelRightOffset(nextFileTreeWidth);
        setFileTreeInlineSidebarWidth(formatPixelWidth(nextFileTreeWidth));
        setDiffInlineSidebarWidth(formatPixelWidth(nextDiffWidth));
        return;
      }

      combinedRightPanelResizeTotalRef.current = null;
      setFileTreeInlineSidebarWidth(formatPixelWidth(requestedFileTreeWidth));
    },
    [
      diffInlineSidebarWidth,
      diffOpen,
      fileTreeInlineSidebarWidth,
      fileTreeOpen,
      scheduleCombinedRightPanelResizeReset,
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

  const shouldRenderDiffContent = diffOpen || hasOpenedDiff;
  const fileTreeContent = threadRef ? (
    <LazyFileTreePanel
      mode={shouldUseDiffSheet ? "sheet" : "sidebar"}
      environmentId={threadRef.environmentId}
      cwd={activeCwd}
      availableEditors={availableEditors}
      onClose={closeFileTree}
      onOpenFileDiff={openFileTreeFileDiff}
      onAddPathMention={addPathMentionToDraft}
    />
  ) : null;

  if (!shouldUseDiffSheet) {
    return (
      <>
        <SidebarInset className="h-dvh  min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
          <ChatView
            environmentId={threadRef.environmentId}
            threadId={threadRef.threadId}
            onDiffPanelOpen={markDiffOpened}
            reserveTitleBarControlInset={!diffOpen && !fileTreeOpen}
            routeKind="server"
          />
        </SidebarInset>
        <DiffPanelInlineSidebar
          diffOpen={diffOpen}
          fixedRightOffset={fileTreeOpen ? fileTreeInlineSidebarWidth : "0px"}
          onCloseDiff={closeDiff}
          onOpenDiff={openDiff}
          onResizeDiffPanel={updateDiffInlineSidebarWidth}
          renderDiffContent={shouldRenderDiffContent}
          width={diffInlineSidebarWidth}
        />
        <FileTreePanelInlineSidebar
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
          onDiffPanelOpen={markDiffOpened}
          routeKind="server"
        />
      </SidebarInset>
      <RightPanelSheet open={diffOpen} onClose={closeDiff}>
        {shouldRenderDiffContent && !fileTreeOpen ? <LazyDiffPanel mode="sheet" /> : null}
      </RightPanelSheet>
      <RightPanelSheet open={fileTreeOpen} onClose={closeFileTree}>
        {fileTreeOpen ? fileTreeContent : null}
      </RightPanelSheet>
    </>
  );
}

export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  search: {
    middlewares: [retainSearchParams<DiffRouteSearch>(["diff", "fileTree"])],
  },
  component: ChatThreadRouteView,
});
