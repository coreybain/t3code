import type { EnvironmentId } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  FileIcon,
  FolderIcon,
  GlobeIcon,
  ListTreeIcon,
  Maximize2Icon,
  Minimize2Icon,
  PlusIcon,
  SquareCodeIcon,
  XIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  decodeFileSidePanelTabId,
  SIDE_PANEL_BROWSER_TAB_ID,
  SIDE_PANEL_REVIEW_TAB_ID,
  SIDE_PANEL_SUMMARY_TAB_ID,
  type SidePanelTabId,
} from "../diffRouteSearch";
import { readEnvironmentApi } from "../environmentApi";
import { useTheme } from "../hooks/useTheme";
import { cn } from "../lib/utils";
import { VscodeEntryIcon } from "./chat/VscodeEntryIcon";
import { Button } from "./ui/button";
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
} from "./ui/command";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "./ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const ThreadFilePanel = lazy(() => import("./ThreadFilePanel"));
const ThreadBrowserPanel = lazy(() => import("./ThreadBrowserPanel"));

function tabLabel(tabId: SidePanelTabId): string {
  if (tabId === SIDE_PANEL_SUMMARY_TAB_ID) return "Summary";
  if (tabId === SIDE_PANEL_REVIEW_TAB_ID) return "Review";
  if (tabId === SIDE_PANEL_BROWSER_TAB_ID) return "Browser";
  const path = decodeFileSidePanelTabId(tabId);
  return path?.split(/[\\/]/).at(-1) ?? "File";
}

function tabIcon(tabId: SidePanelTabId, theme: "light" | "dark"): ReactNode {
  if (tabId === SIDE_PANEL_SUMMARY_TAB_ID) return <ListTreeIcon className="size-4" />;
  if (tabId === SIDE_PANEL_REVIEW_TAB_ID) return <SquareCodeIcon className="size-4" />;
  if (tabId === SIDE_PANEL_BROWSER_TAB_ID) return <GlobeIcon className="size-4" />;
  return (
    <VscodeEntryIcon
      pathValue={decodeFileSidePanelTabId(tabId) ?? ""}
      kind="file"
      theme={theme}
      className="size-4"
    />
  );
}

function ThreadSummaryPanel(props: { children?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
      {props.children ? (
        props.children
      ) : (
        <div className="max-w-xl space-y-3">
          <h2 className="text-sm font-medium text-foreground">Thread summary</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Summary content will appear here. This view is fixed to the side panel and stays
            available while other tools open as tabs.
          </p>
        </div>
      )}
    </div>
  );
}

function ThreadReviewPanel(props: { children: ReactNode }) {
  return <div className="min-h-0 flex-1">{props.children}</div>;
}

function FilePickerCommandDialog(props: {
  cwd: string | null;
  environmentId: EnvironmentId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFile: (relativePath: string) => void;
}) {
  const { cwd, environmentId, onOpenChange, onSelectFile, open } = props;
  const [query, setQuery] = useState("");
  const [directory, setDirectory] = useState("");
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const entriesQuery = useQuery({
    queryKey: ["side-panel-file-picker", environmentId, cwd],
    queryFn: async () => {
      const api = readEnvironmentApi(environmentId);
      if (!api || !cwd) {
        throw new Error("Project files are unavailable.");
      }
      return api.projects.listEntries({ cwd, limit: 25_000 });
    },
    enabled: open && cwd !== null,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDirectory("");
    }
  }, [open]);

  const visibleEntries = useMemo(() => {
    const entries = entriesQuery.data?.entries ?? [];
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length > 0) {
      return entries
        .filter(
          (entry) => entry.kind === "file" && entry.path.toLowerCase().includes(normalizedQuery),
        )
        .slice(0, 80);
    }
    return entries
      .filter((entry) => (entry.parentPath ?? "") === directory)
      .toSorted((left, right) => {
        if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
        return left.path.localeCompare(right.path, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      });
  }, [directory, entriesQuery.data?.entries, query]);

  const parentDirectory = directory.includes("/")
    ? directory.slice(0, directory.lastIndexOf("/"))
    : directory.length > 0
      ? ""
      : null;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup>
        <Command>
          <CommandPanel>
            <CommandInput
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={directory ? `Search in ${directory}` : "Search project files"}
            />
            <CommandList>
              <CommandEmpty>
                {cwd ? "No files found." : "Select a project before opening files."}
              </CommandEmpty>
              {parentDirectory !== null && query.trim().length === 0 ? (
                <CommandItem
                  value=".."
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setDirectory(parentDirectory)}
                >
                  <FolderIcon className="size-4 text-muted-foreground" />
                  <span>..</span>
                </CommandItem>
              ) : null}
              {entriesQuery.isLoading ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Loading files...
                </div>
              ) : entriesQuery.error instanceof Error ? (
                <div className="px-3 py-6 text-center text-sm text-destructive">
                  {entriesQuery.error.message}
                </div>
              ) : (
                visibleEntries.map((entry) => (
                  <CommandItem
                    key={entry.path}
                    value={entry.path}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (entry.kind === "directory") {
                        setQuery("");
                        setDirectory(entry.path);
                        return;
                      }
                      onSelectFile(entry.path);
                      onOpenChange(false);
                    }}
                  >
                    {entry.kind === "directory" ? (
                      <FolderIcon className="size-4 text-muted-foreground" />
                    ) : (
                      <VscodeEntryIcon
                        pathValue={entry.path}
                        kind="file"
                        theme={theme}
                        className="size-4"
                      />
                    )}
                    <span className="min-w-0 truncate">{entry.path}</span>
                  </CommandItem>
                ))
              )}
            </CommandList>
          </CommandPanel>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}

function PanelTabButton(props: {
  active: boolean;
  canClose: boolean;
  tabId: SidePanelTabId;
  theme: "light" | "dark";
  onClose: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "group/tab inline-flex h-8 max-w-44 shrink-0 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        props.active && "bg-muted text-foreground shadow-xs",
      )}
      title={tabLabel(props.tabId)}
      onClick={props.onSelect}
    >
      {props.canClose ? (
        <span
          role="button"
          tabIndex={-1}
          className="hidden size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-background/80 hover:text-foreground group-hover/tab:flex group-focus-visible/tab:flex"
          aria-label={`Close ${tabLabel(props.tabId)}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.onClose();
          }}
        >
          <XIcon className="size-3.5" />
        </span>
      ) : (
        <span className="shrink-0">{tabIcon(props.tabId, props.theme)}</span>
      )}
      {props.canClose ? (
        <span className="shrink-0 group-hover/tab:hidden group-focus-visible/tab:hidden">
          {tabIcon(props.tabId, props.theme)}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{tabLabel(props.tabId)}</span>
    </button>
  );
}

export function ThreadSidePanel(props: {
  activeTabId: SidePanelTabId;
  browserPanelId: string;
  cwd: string | null;
  environmentId: EnvironmentId;
  expanded: boolean;
  reviewContent: ReactNode;
  summaryContent?: ReactNode;
  tabIds: ReadonlyArray<SidePanelTabId>;
  onCloseTab: (tabId: SidePanelTabId) => void;
  onExpandedChange?: ((expanded: boolean) => void) | undefined;
  onOpenBrowser: () => void;
  onOpenFile: (relativePath: string) => void;
  onOpenReview: () => void;
  onSelectTab: (tabId: SidePanelTabId) => void;
}) {
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const activeFilePath = decodeFileSidePanelTabId(props.activeTabId);

  return (
    <div className="flex h-full min-w-0 flex-col bg-background text-foreground">
      <div className="flex h-[42px] shrink-0 items-center gap-1 border-b border-border bg-card px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {props.tabIds.map((tabId) => (
            <PanelTabButton
              key={tabId}
              tabId={tabId}
              theme={theme}
              active={props.activeTabId === tabId}
              canClose={tabId !== SIDE_PANEL_SUMMARY_TAB_ID}
              onSelect={() => props.onSelectTab(tabId)}
              onClose={() => props.onCloseTab(tabId)}
            />
          ))}
          <Menu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <MenuTrigger
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Add side panel tab"
                  />
                }
              >
                <PlusIcon className="size-4" />
              </TooltipTrigger>
              <TooltipPopup>Add tab</TooltipPopup>
            </Tooltip>
            <MenuPopup align="start">
              <MenuItem onClick={() => setFilePickerOpen(true)}>
                <FileIcon className="size-4" />
                Open File
              </MenuItem>
              <MenuSeparator />
              <MenuItem onClick={props.onOpenReview}>
                <SquareCodeIcon className="size-4" />
                Code Review
              </MenuItem>
              <MenuItem onClick={props.onOpenBrowser}>
                <GlobeIcon className="size-4" />
                Browser
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
        {props.onExpandedChange ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={props.expanded ? "Collapse side panel" : "Expand side panel"}
                  aria-pressed={props.expanded}
                  onClick={() => props.onExpandedChange?.(!props.expanded)}
                />
              }
            >
              {props.expanded ? (
                <Minimize2Icon className="size-4" />
              ) : (
                <Maximize2Icon className="size-4" />
              )}
            </TooltipTrigger>
            <TooltipPopup>{props.expanded ? "Collapse" : "Expand"}</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {props.activeTabId === SIDE_PANEL_SUMMARY_TAB_ID ? (
          <ThreadSummaryPanel>{props.summaryContent}</ThreadSummaryPanel>
        ) : null}
        {props.activeTabId === SIDE_PANEL_REVIEW_TAB_ID ? (
          <ThreadReviewPanel>{props.reviewContent}</ThreadReviewPanel>
        ) : null}
        {activeFilePath ? (
          <Suspense
            fallback={
              <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
                Loading editor...
              </div>
            }
          >
            <ThreadFilePanel
              key={activeFilePath}
              cwd={props.cwd}
              environmentId={props.environmentId}
              relativePath={activeFilePath}
            />
          </Suspense>
        ) : null}
        {props.activeTabId === SIDE_PANEL_BROWSER_TAB_ID ? (
          <Suspense
            fallback={
              <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
                Loading browser...
              </div>
            }
          >
            <ThreadBrowserPanel panelId={props.browserPanelId} />
          </Suspense>
        ) : null}
      </div>
      <FilePickerCommandDialog
        cwd={props.cwd}
        environmentId={props.environmentId}
        open={filePickerOpen}
        onOpenChange={setFilePickerOpen}
        onSelectFile={props.onOpenFile}
      />
    </div>
  );
}
