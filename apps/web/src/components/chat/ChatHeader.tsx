import {
  type EnvironmentId,
  type EditorId,
  type ProjectScript,
  type ResolvedKeybindingsConfig,
  type ThreadId,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime";
import { memo } from "react";
import GitActionsControl from "../GitActionsControl";
import { type DraftId } from "~/composerDraftStore";
import { DiffIcon, FolderTreeIcon, PanelLeftOpenIcon, TerminalSquareIcon } from "lucide-react";
import { Badge } from "../ui/badge";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import ProjectScriptsControl, { type NewProjectScriptInput } from "../ProjectScriptsControl";
import { Toggle } from "../ui/toggle";
import { SidebarTrigger, useSidebar } from "../ui/sidebar";
import { OpenInPicker } from "./OpenInPicker";
import { Button } from "../ui/button";
import { cn } from "~/lib/utils";

interface ChatHeaderProps {
  activeThreadEnvironmentId: EnvironmentId;
  activeThreadId: ThreadId;
  draftId?: DraftId;
  activeThreadTitle: string;
  activeProjectName: string | undefined;
  activeProjectKey: string | null;
  draftProjectOptions: ReadonlyArray<{
    value: string;
    label: string;
    cwd: string;
  }>;
  isGitRepo: boolean;
  openInCwd: string | null;
  activeProjectScripts: ProjectScript[] | undefined;
  preferredScriptId: string | null;
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalToggleShortcutLabel: string | null;
  diffToggleShortcutLabel: string | null;
  gitCwd: string | null;
  fileTreeAvailable: boolean;
  fileTreeOpen: boolean;
  diffOpen: boolean;
  hasPlanInSidePanel: boolean;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<void>;
  onUpdateProjectScript: (scriptId: string, input: NewProjectScriptInput) => Promise<void>;
  onDeleteProjectScript: (scriptId: string) => Promise<void>;
  onToggleTerminal: () => void;
  onToggleFileTree: () => void;
  onToggleDiff: () => void;
  onDraftProjectChange: (projectKey: string | null) => void;
}

export const ChatHeader = memo(function ChatHeader({
  activeThreadEnvironmentId,
  activeThreadId,
  draftId,
  activeThreadTitle,
  activeProjectName,
  activeProjectKey,
  draftProjectOptions,
  isGitRepo,
  openInCwd,
  activeProjectScripts,
  preferredScriptId,
  keybindings,
  availableEditors,
  terminalAvailable,
  terminalOpen,
  terminalToggleShortcutLabel,
  diffToggleShortcutLabel,
  gitCwd,
  fileTreeAvailable,
  fileTreeOpen,
  diffOpen,
  hasPlanInSidePanel,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
  onToggleTerminal,
  onToggleFileTree,
  onToggleDiff,
  onDraftProjectChange,
}: ChatHeaderProps) {
  const showDraftProjectPicker =
    activeProjectKey !== null && draftProjectOptions.length > 1 && activeProjectName !== undefined;
  const { open: leftPanelOpen, setOpen: setLeftPanelOpen } = useSidebar();

  return (
    <div className="@container/header-actions flex min-w-0 flex-1 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
        <SidebarTrigger className="size-7 shrink-0 md:hidden" />
        {!leftPanelOpen ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="hidden shrink-0 text-muted-foreground hover:text-foreground md:inline-flex"
                  aria-label="Open projects and threads panel"
                  onClick={() => setLeftPanelOpen(true)}
                />
              }
            >
              <PanelLeftOpenIcon className="size-4" />
            </TooltipTrigger>
            <TooltipPopup side="bottom">Open panel</TooltipPopup>
          </Tooltip>
        ) : null}
        <h2
          className="min-w-0 shrink truncate text-sm font-medium text-foreground"
          title={activeThreadTitle}
        >
          {activeThreadTitle}
        </h2>
        {showDraftProjectPicker ? (
          <Select
            value={activeProjectKey ?? ""}
            onValueChange={(projectKey) => {
              onDraftProjectChange(projectKey);
            }}
            items={draftProjectOptions}
          >
            <SelectTrigger
              variant="ghost"
              size="xs"
              className="h-6 max-w-48 min-w-0 shrink gap-1 rounded-full border-border px-2 text-xs font-medium text-foreground hover:bg-accent"
              aria-label="Project"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectPopup className="min-w-64">
              {draftProjectOptions.map((project) => (
                <SelectItem key={project.value} value={project.value}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{project.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{project.cwd}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        ) : activeProjectName ? (
          <Badge variant="outline" className="min-w-0 shrink overflow-hidden">
            <span className="min-w-0 truncate">{activeProjectName}</span>
          </Badge>
        ) : null}
        {activeProjectName && !isGitRepo && (
          <Badge variant="outline" className="shrink-0 text-[10px] text-amber-700">
            No Git
          </Badge>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 @3xl/header-actions:gap-3">
        {activeProjectScripts && (
          <ProjectScriptsControl
            scripts={activeProjectScripts}
            keybindings={keybindings}
            preferredScriptId={preferredScriptId}
            onRunScript={onRunProjectScript}
            onAddScript={onAddProjectScript}
            onUpdateScript={onUpdateProjectScript}
            onDeleteScript={onDeleteProjectScript}
          />
        )}
        {activeProjectName && (
          <OpenInPicker
            keybindings={keybindings}
            availableEditors={availableEditors}
            openInCwd={openInCwd}
          />
        )}
        {activeProjectName && (
          <GitActionsControl
            gitCwd={gitCwd}
            activeThreadRef={scopeThreadRef(activeThreadEnvironmentId, activeThreadId)}
            {...(draftId ? { draftId } : {})}
          />
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                className="shrink-0"
                pressed={terminalOpen}
                onPressedChange={onToggleTerminal}
                aria-label="Toggle terminal drawer"
                variant="outline"
                size="xs"
                disabled={!terminalAvailable}
              >
                <TerminalSquareIcon className="size-3" />
              </Toggle>
            }
          />
          <TooltipPopup side="bottom">
            {!terminalAvailable
              ? "Terminal is unavailable until this thread has an active project."
              : terminalToggleShortcutLabel
                ? `Toggle terminal drawer (${terminalToggleShortcutLabel})`
                : "Toggle terminal drawer"}
          </TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                className="shrink-0"
                pressed={fileTreeOpen}
                onPressedChange={onToggleFileTree}
                aria-label="Toggle file tree"
                variant="outline"
                size="xs"
                disabled={!fileTreeAvailable}
              >
                <FolderTreeIcon className="size-3" />
              </Toggle>
            }
          />
          <TooltipPopup side="bottom">
            {!fileTreeAvailable
              ? "File tree is unavailable until this thread has an active project."
              : "Toggle file tree"}
          </TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                className={cn(
                  "shrink-0",
                  hasPlanInSidePanel &&
                    "border-blue-500/40 text-blue-400 hover:text-blue-300 data-pressed:bg-blue-500/10",
                )}
                pressed={diffOpen}
                onPressedChange={onToggleDiff}
                aria-label="Toggle Side Panel"
                variant="outline"
                size="xs"
              >
                <DiffIcon className="size-3" />
              </Toggle>
            }
          />
          <TooltipPopup side="bottom">
            {diffToggleShortcutLabel
              ? `Toggle Side Panel (${diffToggleShortcutLabel})`
              : "Toggle Side Panel"}
          </TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
});
