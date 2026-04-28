import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { scopeProjectRef } from "@t3tools/client-runtime";
import { Schema } from "effect";
import ChatView from "../components/ChatView";
import { threadHasStarted } from "../components/ChatView.logic";
import { useComposerDraftStore, DraftId } from "../composerDraftStore";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "../components/ui/sidebar";
import { createThreadSelectorAcrossEnvironments } from "../storeSelectors";
import { selectProjectByRef, useStore } from "../store";
import { buildDraftThreadRouteParams, buildThreadRouteParams } from "../threadRoutes";
import { RightPanelSheet } from "../components/RightPanelSheet";
import { parseDiffRouteSearch } from "../diffRouteSearch";
import { useServerAvailableEditors } from "~/rpc/serverState";
import { projectScriptCwd } from "@t3tools/shared/projectScripts";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { getLocalStorageItem } from "~/hooks/useLocalStorage";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "../rightPanelLayout";

const FileTreePanel = lazy(() => import("../components/FileTreePanel"));
const FILE_TREE_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_file_tree_sidebar_width";
const RIGHT_PANEL_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_right_panel_sidebar_width";
const FILE_TREE_INLINE_DEFAULT_WIDTH = "clamp(20rem,32vw,28rem)";
const FILE_TREE_INLINE_SIDEBAR_MIN_WIDTH = 18 * 16;

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

function getInitialFileTreeInlineSidebarWidth() {
  if (typeof window === "undefined") {
    return FILE_TREE_INLINE_DEFAULT_WIDTH;
  }

  const storedWidth =
    getStoredInlineSidebarWidth(FILE_TREE_INLINE_SIDEBAR_WIDTH_STORAGE_KEY) ??
    getStoredInlineSidebarWidth(RIGHT_PANEL_INLINE_SIDEBAR_WIDTH_STORAGE_KEY);
  return storedWidth === null
    ? FILE_TREE_INLINE_DEFAULT_WIDTH
    : formatPixelWidth(Math.max(FILE_TREE_INLINE_SIDEBAR_MIN_WIDTH, storedWidth));
}

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

function DraftChatThreadRouteView() {
  const navigate = useNavigate();
  const { draftId: rawDraftId } = Route.useParams();
  const draftId = DraftId.make(rawDraftId);
  const search = useSearch({
    strict: false,
    select: (params) => parseDiffRouteSearch(params),
  });
  const draftSession = useComposerDraftStore((store) => store.getDraftSession(draftId));
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
  const fileTreeOpen = search.fileTree === "1";
  const shouldUseFileTreeSheet = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  const [fileTreeInlineSidebarWidth, setFileTreeInlineSidebarWidth] = useState(
    getInitialFileTreeInlineSidebarWidth,
  );
  const fileTreeCwd = activeProject
    ? projectScriptCwd({
        project: { cwd: activeProject.cwd },
        worktreePath: draftSession?.worktreePath ?? null,
      })
    : null;
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
      mode={shouldUseFileTreeSheet ? "sheet" : "sidebar"}
      environmentId={draftSession.environmentId}
      cwd={fileTreeCwd}
      availableEditors={availableEditors}
      onClose={closeFileTree}
      onOpenFileDiff={() => {}}
      onAddPathMention={addPathMentionToDraft}
    />
  );

  if (!shouldUseFileTreeSheet) {
    return (
      <>
        <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
          <ChatView
            draftId={draftId}
            environmentId={draftSession.environmentId}
            threadId={draftSession.threadId}
            routeKind="draft"
          />
        </SidebarInset>
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
          draftId={draftId}
          environmentId={draftSession.environmentId}
          threadId={draftSession.threadId}
          routeKind="draft"
        />
      </SidebarInset>
      <RightPanelSheet open={fileTreeOpen} onClose={closeFileTree}>
        {fileTreeOpen ? fileTreeContent : null}
      </RightPanelSheet>
    </>
  );
}

export const Route = createFileRoute("/_chat/draft/$draftId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  component: DraftChatThreadRouteView,
});
