import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { scopeProjectRef } from "@t3tools/client-runtime";
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
import { parseDiffRouteSearch, stripDiffSearchParams } from "../diffRouteSearch";
import { useServerAvailableEditors } from "~/rpc/serverState";
import { projectScriptCwd } from "@t3tools/shared/projectScripts";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { getLocalStorageItem } from "~/hooks/useLocalStorage";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "../rightPanelLayout";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";

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
const CHAT_HEADER_HEIGHT = "52px";

function formatPixelWidth(width: number) {
  return `${width}px`;
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
  minWidth: number;
  storageKey: string;
}) {
  if (typeof window === "undefined") {
    return input.defaultWidth;
  }

  const storedWidth =
    getStoredInlineSidebarWidth(input.storageKey) ??
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

const DiffPanelInlineSidebar = (props: {
  bottomInset: string;
  diffOpen: boolean;
  fixedRightOffset: string;
  onCloseDiff: () => void;
  onOpenDiff: () => void;
  onResizeDiffPanel: (width: number) => void;
  width: string;
}) => {
  const {
    bottomInset,
    diffOpen,
    fixedRightOffset,
    onCloseDiff,
    onOpenDiff,
    onResizeDiffPanel,
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
      className="w-auto min-h-0 flex-none bg-transparent [&_[data-slot=sidebar-gap]]:hidden"
      data-inline-right-panel="diff"
      style={{ "--sidebar-width": width } as React.CSSProperties}
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
        resizable={{
          minWidth: DIFF_INLINE_SIDEBAR_MIN_WIDTH,
          onResize: onResizeDiffPanel,
          shouldAcceptWidth: shouldAcceptInlineSidebarWidth,
          storageKey: DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        {diffOpen ? <LazyDiffPanel mode="sidebar" /> : null}
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
  const diffOpen = search.diff === "1";
  const fileTreeOpen = search.fileTree === "1";
  const shouldUseRightPanelSheet = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
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
  const fileTreeCwd = activeProject
    ? projectScriptCwd({
        project: { cwd: activeProject.cwd },
        worktreePath: draftSession?.worktreePath ?? null,
      })
    : null;
  const closeDiff = useCallback(() => {
    void navigate({
      to: "/draft/$draftId",
      params: buildDraftThreadRouteParams(draftId),
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, diff: undefined };
      },
    });
  }, [draftId, navigate]);
  const openDiff = useCallback(() => {
    void navigate({
      to: "/draft/$draftId",
      params: buildDraftThreadRouteParams(draftId),
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, diff: "1" };
      },
    });
  }, [draftId, navigate]);
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
  const updateDiffInlineSidebarWidth = useCallback((width: number) => {
    setDiffInlineSidebarWidth(formatPixelWidth(Math.max(DIFF_INLINE_SIDEBAR_MIN_WIDTH, width)));
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
      onOpenFileDiff={() => {}}
      onAddPathMention={addPathMentionToDraft}
    />
  );
  const mainContentRightInset =
    diffOpen && fileTreeOpen
      ? `calc(${diffInlineSidebarWidth} + ${fileTreeInlineSidebarWidth})`
      : diffOpen
        ? diffInlineSidebarWidth
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
            mainContentRightInset={mainContentRightInset}
            onTerminalLiveHeightChange={setLiveTerminalHeight}
            routeKind="draft"
          />
        </SidebarInset>
        <DiffPanelInlineSidebar
          bottomInset={terminalBottomInset}
          diffOpen={diffOpen}
          fixedRightOffset={fileTreeOpen ? fileTreeInlineSidebarWidth : "0px"}
          onCloseDiff={closeDiff}
          onOpenDiff={openDiff}
          onResizeDiffPanel={updateDiffInlineSidebarWidth}
          width={diffInlineSidebarWidth}
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
          onTerminalLiveHeightChange={setLiveTerminalHeight}
          routeKind="draft"
        />
      </SidebarInset>
      <RightPanelSheet bottomInset={terminalBottomInset} open={diffOpen} onClose={closeDiff}>
        {diffOpen && !fileTreeOpen ? <LazyDiffPanel mode="sheet" /> : null}
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
