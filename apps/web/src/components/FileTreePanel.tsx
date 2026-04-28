import type { EditorId, EnvironmentId, GitStatusResult } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileSearchIcon,
  FolderClosedIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import {
  memo,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { openInPreferredEditor, usePreferredEditor } from "~/editorPreferences";
import { readEnvironmentApi } from "~/environmentApi";
import { useGitStatus } from "~/lib/gitStatusState";
import {
  buildChangedProjectEntryTree,
  buildProjectEntryTree,
  collectDirectoryPaths,
  filterProjectEntryTree,
  type ProjectEntryTreeNode,
} from "~/lib/projectEntryTree";
import { readLocalApi } from "~/localApi";
import { resolvePathLinkTarget } from "~/terminal-links";
import { useTheme } from "~/hooks/useTheme";

import {
  AntigravityIcon,
  CursorIcon,
  Icon,
  IntelliJIdeaIcon,
  KiroIcon,
  TraeIcon,
  VisualStudioCode,
  VisualStudioCodeInsiders,
  VSCodium,
  Zed,
} from "./Icons";
import { VscodeEntryIcon } from "./chat/VscodeEntryIcon";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import { stackedThreadToast, toastManager } from "./ui/toast";

type FileTreePanelMode = "sidebar" | "sheet";
type FileTreeViewMode = "all" | "changed";

const WORKSPACE_LIST_LIMIT = 25_000;
const FILE_TREE_SEARCH_DEBOUNCE_MS = 180;

const editorOptions: ReadonlyArray<{ label: string; value: EditorId; Icon: Icon }> = [
  { label: "Cursor", value: "cursor", Icon: CursorIcon },
  { label: "Trae", value: "trae", Icon: TraeIcon },
  { label: "Kiro", value: "kiro", Icon: KiroIcon },
  { label: "VS Code", value: "vscode", Icon: VisualStudioCode },
  { label: "VS Code Insiders", value: "vscode-insiders", Icon: VisualStudioCodeInsiders },
  { label: "VSCodium", value: "vscodium", Icon: VSCodium },
  { label: "Zed", value: "zed", Icon: Zed },
  { label: "Antigravity", value: "antigravity", Icon: AntigravityIcon },
  { label: "IntelliJ IDEA", value: "idea", Icon: IntelliJIdeaIcon },
  { label: "File manager", value: "file-manager", Icon: FolderClosedIcon },
];

function allTopLevelDirectories(nodes: ReadonlyArray<ProjectEntryTreeNode>): string[] {
  return nodes.filter((node) => node.kind === "directory").map((node) => node.path);
}

function pathMentionLabel(kind: "file" | "directory"): string {
  return kind === "file" ? "Add file to chat" : "Add folder to chat";
}

function FileTreePanelHeader(props: {
  viewMode: FileTreeViewMode;
  onViewModeChange: (viewMode: FileTreeViewMode) => void;
  searchInputValue: string;
  searchVisible: boolean;
  onSearchInputValueChange: (query: string) => void;
  onToggleSearch: () => void;
  onClose: () => void;
}) {
  const selectedViewLabel = props.viewMode === "all" ? "All files" : "Changed files";
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!props.searchVisible) {
      return;
    }
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, [props.searchVisible]);

  return (
    <div className="flex flex-col border-b border-border">
      <div className="flex h-12 min-w-0 items-center justify-between gap-2 px-4">
        <Select
          value={props.viewMode}
          onValueChange={(value) => props.onViewModeChange(value as FileTreeViewMode)}
        >
          <SelectTrigger
            size="sm"
            variant="ghost"
            className="h-7 min-h-7 w-fit min-w-0 gap-1.5 px-1.5 font-medium text-foreground sm:h-6 sm:min-h-6 [&_[data-slot=select-icon]_svg]:text-foreground [&_[data-slot=select-icon]_svg]:opacity-100 [&_[data-slot=select-icon]_svg]:stroke-2.5"
            aria-label="File tree view"
          >
            <SelectValue>{selectedViewLabel}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="all">All files</SelectItem>
            <SelectItem value="changed">Changed files</SelectItem>
          </SelectPopup>
        </Select>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground data-[active=true]:text-foreground"
            onClick={props.onToggleSearch}
            aria-label={props.searchVisible ? "Hide file search" : "Search files"}
            data-active={props.searchVisible || props.searchInputValue.length > 0}
          >
            <SearchIcon className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={props.onClose}
            aria-label="Close file tree"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>
      {props.searchVisible ? (
        <div className="px-3 pb-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              ref={searchInputRef}
              type="search"
              size="sm"
              className="rounded-md [&_[data-slot=input]]:pl-7"
              placeholder="Search files"
              value={props.searchInputValue}
              onChange={(event) => props.onSearchInputValueChange(event.currentTarget.value)}
            />
            {props.searchInputValue ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="absolute right-1 top-1/2 z-10 -translate-y-1/2"
                onClick={() => props.onSearchInputValueChange("")}
                aria-label="Clear file search"
              >
                <XIcon className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FileTreeStatus(props: { icon?: boolean; children: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10 text-center text-xs text-muted-foreground/75">
      <div className="flex max-w-72 flex-col items-center gap-2">
        {props.icon ? <FileSearchIcon className="size-5 text-muted-foreground/55" /> : null}
        <p>{props.children}</p>
      </div>
    </div>
  );
}

interface FileTreeRowProps {
  node: ProjectEntryTreeNode;
  depth: number;
  expandedPaths: ReadonlySet<string>;
  theme: "light" | "dark";
  onToggle: (path: string) => void;
  onContextMenu: (node: ProjectEntryTreeNode, event: ReactMouseEvent) => void;
}

const FileTreeRow = memo(function FileTreeRow(props: FileTreeRowProps) {
  const { node, depth, expandedPaths, theme, onToggle, onContextMenu } = props;
  const hasChildren = node.kind === "directory" && node.children.length > 0;
  const expanded = expandedPaths.has(node.path);

  return (
    <div>
      <button
        type="button"
        className="flex h-7 w-full min-w-0 items-center gap-1 rounded-sm px-1 text-left text-sm text-foreground/90 hover:bg-accent hover:text-accent-foreground"
        style={{ paddingLeft: `${Math.max(4, depth * 14 + 4)}px` }}
        onClick={() => {
          if (node.kind === "directory") {
            onToggle(node.path);
          }
        }}
        onContextMenu={(event) => onContextMenu(node, event)}
        title={node.path}
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {hasChildren ? (
            expanded ? (
              <ChevronDownIcon className="size-3.5" />
            ) : (
              <ChevronRightIcon className="size-3.5" />
            )
          ) : node.kind === "file" ? (
            <VscodeEntryIcon
              pathValue={node.path}
              kind={node.kind}
              theme={theme}
              className="size-4"
            />
          ) : null}
        </span>
        <span className="min-w-0 truncate">{node.name}</span>
      </button>
      {hasChildren && expanded
        ? node.children.map((child) => {
            return (
              <FileTreeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                theme={theme}
                onToggle={onToggle}
                onContextMenu={onContextMenu}
              />
            );
          })
        : null}
    </div>
  );
});

export default function FileTreePanel(props: {
  mode: FileTreePanelMode;
  environmentId: EnvironmentId;
  cwd: string | null;
  availableEditors: ReadonlyArray<EditorId>;
  gitStatus?: GitStatusResult | null;
  onClose: () => void;
  onOpenFileDiff: (filePath: string) => void;
  onAddPathMention: (kind: "file" | "directory", path: string) => void;
}) {
  const {
    availableEditors,
    cwd,
    environmentId,
    gitStatus: providedGitStatus,
    mode,
    onAddPathMention,
    onClose,
    onOpenFileDiff,
  } = props;
  const [viewMode, setViewMode] = useState<FileTreeViewMode>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [preferredEditor] = usePreferredEditor(availableEditors);
  const { resolvedTheme } = useTheme();
  const gitStatusState = useGitStatus({ environmentId, cwd });
  const gitStatus = providedGitStatus ?? gitStatusState.data;
  const hasProjectCwd = cwd !== null;
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const allFilesQuery = useQuery({
    queryKey: ["project-list-entries", environmentId, cwd],
    queryFn: async () => {
      const api = readEnvironmentApi(environmentId);
      if (!api) {
        throw new Error("Environment API is unavailable.");
      }
      if (!cwd) {
        throw new Error("Select a project to browse files.");
      }
      return api.projects.listEntries({ cwd, limit: WORKSPACE_LIST_LIMIT });
    },
    staleTime: 15_000,
    enabled: hasProjectCwd && viewMode === "all",
  });
  const allTree = useMemo(
    () => buildProjectEntryTree(allFilesQuery.data?.entries ?? []),
    [allFilesQuery.data?.entries],
  );
  const changedTree = useMemo(
    () => buildChangedProjectEntryTree(gitStatus?.workingTree.files ?? []),
    [gitStatus?.workingTree.files],
  );
  const sourceTree = viewMode === "all" ? allTree : changedTree;
  const filteredTree = useMemo(
    () => filterProjectEntryTree(sourceTree, searchQuery),
    [searchQuery, sourceTree],
  );
  const visibleExpandedPaths = useMemo(() => {
    if (!searchQuery.trim()) {
      return expandedPaths;
    }
    return new Set(collectDirectoryPaths(filteredTree));
  }, [expandedPaths, filteredTree, searchQuery]);
  const availableEditorOptions = useMemo(
    () => editorOptions.filter((option) => availableEditors.includes(option.value)),
    [availableEditors],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInputValue);
    }, FILE_TREE_SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInputValue]);

  const searchVisible = searchOpen || searchInputValue.length > 0 || searchQuery.length > 0;

  const clearSearch = useCallback(() => {
    setSearchInputValue("");
    setSearchQuery("");
  }, []);

  const toggleSearch = useCallback(() => {
    if (searchVisible) {
      clearSearch();
      setSearchOpen(false);
      return;
    }
    setSearchOpen(true);
  }, [clearSearch, searchVisible]);

  useEffect(() => {
    if (viewMode === "changed") {
      setExpandedPaths(new Set(allTopLevelDirectories(changedTree)));
      return;
    }
    setExpandedPaths(new Set());
  }, [changedTree, viewMode]);

  const togglePath = useCallback((path: string) => {
    setExpandedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const copyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch (error) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Unable to copy path",
          description: error instanceof Error ? error.message : "Clipboard access failed.",
        }),
      );
    }
  }, []);

  const openWithEditor = useCallback(
    async (path: string, editor: EditorId | null) => {
      const api = readLocalApi();
      if (!api || !cwd) return;
      const targetPath = resolvePathLinkTarget(path, cwd);
      try {
        if (editor) {
          await api.shell.openInEditor(targetPath, editor);
          return;
        }
        await openInPreferredEditor(api, targetPath);
      } catch (error) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Unable to open file",
            description: error instanceof Error ? error.message : "Editor launch failed.",
          }),
        );
      }
    },
    [cwd],
  );

  const showContextMenu = useCallback(
    async (node: ProjectEntryTreeNode, event: ReactMouseEvent) => {
      event.preventDefault();
      const api = readLocalApi();
      if (!api) return;

      const openWithChildren = availableEditorOptions.map((option) => ({
        id: `open-with:${option.value}` as const,
        label: option.label,
      }));
      const clicked = await api.contextMenu.show(
        node.kind === "file"
          ? [
              { id: "open-file-diff", label: "Open file in editor" },
              {
                id: "open-with",
                label: "Open with",
                disabled: openWithChildren.length === 0,
                children: openWithChildren,
              },
              { id: "copy-path", label: "Copy path", separatorBefore: true },
              { id: "add-to-chat", label: pathMentionLabel(node.kind) },
            ]
          : [
              { id: "copy-path", label: "Copy path" },
              { id: "add-to-chat", label: pathMentionLabel(node.kind) },
            ],
        { x: event.clientX, y: event.clientY },
      );

      if (clicked === "open-file-diff") {
        onOpenFileDiff(node.path);
      } else if (clicked?.startsWith("open-with:")) {
        await openWithEditor(node.path, clicked.slice("open-with:".length) as EditorId);
      } else if (clicked === "copy-path") {
        await copyPath(node.path);
      } else if (clicked === "add-to-chat") {
        onAddPathMention(node.kind, node.path);
      } else if (clicked === "open-with") {
        await openWithEditor(node.path, preferredEditor);
      }
    },
    [
      availableEditorOptions,
      copyPath,
      onAddPathMention,
      onOpenFileDiff,
      openWithEditor,
      preferredEditor,
    ],
  );

  const isProjectUnavailable = !hasProjectCwd;
  const isChangedUnavailable = viewMode === "changed" && gitStatus && !gitStatus.isRepo;
  const isLoading = viewMode === "all" && allFilesQuery.isLoading;
  const error =
    viewMode === "all" && allFilesQuery.error instanceof Error ? allFilesQuery.error.message : null;
  const emptyLabel =
    searchQuery.trim().length > 0
      ? "No files match this search."
      : viewMode === "changed"
        ? "No changed files."
        : "No files found.";

  return (
    <div className="flex h-full min-w-0 flex-col bg-background" data-panel-mode={mode}>
      <FileTreePanelHeader
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchInputValue={searchInputValue}
        searchVisible={searchVisible}
        onSearchInputValueChange={(value) => {
          setSearchInputValue(value);
          if (value.length === 0) {
            setSearchQuery("");
          }
        }}
        onToggleSearch={toggleSearch}
        onClose={onClose}
      />
      {allFilesQuery.data?.truncated && viewMode === "all" ? (
        <div className="border-b border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground/75">
          Showing the first {WORKSPACE_LIST_LIMIT.toLocaleString()} entries.
        </div>
      ) : null}
      {isProjectUnavailable ? (
        <FileTreeStatus icon>Select a project to browse files.</FileTreeStatus>
      ) : isLoading ? (
        <FileTreeStatus>Loading files...</FileTreeStatus>
      ) : error ? (
        <FileTreeStatus icon>{error}</FileTreeStatus>
      ) : isChangedUnavailable ? (
        <FileTreeStatus icon>Changed files are available only in git repositories.</FileTreeStatus>
      ) : filteredTree.length === 0 ? (
        <FileTreeStatus icon>{emptyLabel}</FileTreeStatus>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
          {filteredTree.map((node) => (
            <FileTreeRow
              key={node.path}
              node={node}
              depth={0}
              expandedPaths={visibleExpandedPaths}
              theme={theme}
              onToggle={togglePath}
              onContextMenu={showContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}
