import { memo, useState, useCallback, useMemo } from "react";
import type {
  EnvironmentId,
  GitStatusResult,
  OrchestrationThreadActivity,
  ServerProviderSkill,
} from "@t3tools/contracts";
import { type TimestampFormat } from "@t3tools/contracts/settings";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import ChatMarkdown from "./ChatMarkdown";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  GithubIcon,
  EllipsisIcon,
  GlobeIcon,
  LoaderIcon,
  PanelRightCloseIcon,
  PencilIcon,
  PackageIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import type { ActivePlanState } from "../session-logic";
import type { LatestProposedPlanState } from "../session-logic";
import type { Thread, TurnDiffSummary } from "../types";
import { formatTimestamp } from "../timestampFormat";
import {
  proposedPlanTitle,
  buildProposedPlanMarkdownFilename,
  normalizePlanMarkdownForExport,
  downloadPlanAsTextFile,
  stripDisplayedPlanMarkdown,
} from "../proposedPlan";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "./ui/menu";
import { readEnvironmentApi } from "~/environmentApi";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { formatProviderSkillDisplayName } from "~/providerSkillPresentation";
import type { WorkLogEntry } from "../session-logic";

function stepStatusIcon(status: string): React.ReactNode {
  if (status === "completed") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
        <CheckIcon className="size-3" />
      </span>
    );
  }
  if (status === "inProgress") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-400">
        <LoaderIcon className="size-3 animate-spin" />
      </span>
    );
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30">
      <span className="size-1.5 rounded-full bg-muted-foreground/30" />
    </span>
  );
}

interface PlanSidebarProps {
  activePlan: ActivePlanState | null;
  activeProposedPlan: LatestProposedPlanState | null;
  label?: string;
  environmentId: EnvironmentId;
  markdownCwd: string | undefined;
  workspaceRoot: string | undefined;
  timestampFormat: TimestampFormat;
  mode?: "sheet" | "sidebar";
  onClose: () => void;
}

interface PlanSummaryContentProps {
  activePlan: ActivePlanState | null;
  activeProposedPlan: LatestProposedPlanState | null;
  label?: string;
  environmentId: EnvironmentId;
  markdownCwd: string | undefined;
  workspaceRoot: string | undefined;
  timestampFormat: TimestampFormat;
  activeThread?: Thread | null;
  gitStatus?: GitStatusResult | null;
  latestWorkLogEntries?: ReadonlyArray<WorkLogEntry>;
  providerSkills?: ReadonlyArray<ServerProviderSkill>;
  turnDiffSummaries?: ReadonlyArray<TurnDiffSummary>;
}

interface SummaryItem {
  id: string;
  label: string;
  detail?: string;
}

function sectionHeading(label: string): React.ReactNode {
  return (
    <p className="text-[11px] font-semibold tracking-wide text-muted-foreground/70">{label}</p>
  );
}

function uniqueSummaryItems(items: ReadonlyArray<SummaryItem>): SummaryItem[] {
  const seen = new Set<string>();
  const unique: SummaryItem[] = [];
  for (const item of items) {
    const key = item.id || item.label;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function basename(pathValue: string): string {
  const segments = pathValue.split(/[\\/]/);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment) return segment;
  }
  return pathValue;
}

function filenameFromPlanMarkdown(markdown: string): string {
  return buildProposedPlanMarkdownFilename(markdown);
}

function collectArtifactItems(input: {
  activeProposedPlan: LatestProposedPlanState | null;
  activeThread?: Thread | null | undefined;
  gitStatus?: GitStatusResult | null | undefined;
  turnDiffSummaries?: ReadonlyArray<TurnDiffSummary> | undefined;
}): SummaryItem[] {
  const items: SummaryItem[] = [];
  if (input.activeProposedPlan?.planMarkdown) {
    const filename = filenameFromPlanMarkdown(input.activeProposedPlan.planMarkdown);
    items.push({ id: `plan:${filename}`, label: filename });
  }

  const changedPaths = [
    ...(input.turnDiffSummaries ?? input.activeThread?.turnDiffSummaries ?? []).flatMap((summary) =>
      summary.files.map((file) => file.path),
    ),
    ...(input.gitStatus?.workingTree.files ?? []).map((file) => file.path),
  ];
  for (const path of changedPaths) {
    const lowerPath = path.toLowerCase();
    const isDocument =
      lowerPath.endsWith(".md") ||
      lowerPath.endsWith(".mdx") ||
      lowerPath.includes("/docs/") ||
      lowerPath.includes("\\docs\\");
    if (!isDocument) continue;
    items.push({ id: `file:${path}`, label: basename(path), detail: path });
  }
  return uniqueSummaryItems(items);
}

function collectSourceItems(input: {
  activeThread?: Thread | null | undefined;
  providerSkills?: ReadonlyArray<ServerProviderSkill> | undefined;
  activities?: ReadonlyArray<OrchestrationThreadActivity> | undefined;
}): SummaryItem[] {
  const items: SummaryItem[] = [];
  const promptText = (input.activeThread?.messages ?? [])
    .filter((message) => message.role === "user")
    .map((message) => message.text)
    .join("\n");
  for (const skill of input.providerSkills ?? []) {
    if (!promptText.includes(`$${skill.name}`)) continue;
    items.push({
      id: `skill:${skill.name}`,
      label: `${formatProviderSkillDisplayName(skill)} skill`,
    });
  }

  for (const activity of input.activities ?? input.activeThread?.activities ?? []) {
    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    const itemType = typeof payload?.itemType === "string" ? payload.itemType : null;
    if (itemType === "web_search") {
      items.push({ id: "web-search", label: "Web search" });
    }
    if (itemType === "mcp_tool_call") {
      const title = typeof payload?.title === "string" ? payload.title.trim() : "";
      items.push({ id: `mcp:${title || activity.summary}`, label: title || activity.summary });
    }
  }
  return uniqueSummaryItems(items);
}

function changeSummary(gitStatus: GitStatusResult | null | undefined): string | null {
  if (!gitStatus?.isRepo) return null;
  const fileCount = gitStatus.workingTree.files.length;
  const parts: string[] = [];
  if (fileCount > 0) {
    parts.push(`${fileCount.toLocaleString()} ${fileCount === 1 ? "file" : "files"}`);
  }
  if (gitStatus.workingTree.insertions > 0) {
    parts.push(`+${gitStatus.workingTree.insertions.toLocaleString()}`);
  }
  if (gitStatus.workingTree.deletions > 0) {
    parts.push(`-${gitStatus.workingTree.deletions.toLocaleString()}`);
  }
  return parts.length > 0 ? parts.join(", ") : "No changes";
}

const PlanSummaryContent = memo(function PlanSummaryContent({
  activePlan,
  activeProposedPlan,
  label = "Plan",
  environmentId,
  markdownCwd,
  workspaceRoot,
  timestampFormat,
  activeThread,
  gitStatus,
  latestWorkLogEntries = [],
  providerSkills = [],
  turnDiffSummaries = [],
}: PlanSummaryContentProps) {
  const [proposedPlanExpanded, setProposedPlanExpanded] = useState(false);
  const [artifactsExpanded, setArtifactsExpanded] = useState(false);
  const [isSavingToWorkspace, setIsSavingToWorkspace] = useState(false);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const planMarkdown = activeProposedPlan?.planMarkdown ?? null;
  const displayedPlanMarkdown = planMarkdown ? stripDisplayedPlanMarkdown(planMarkdown) : null;
  const planTitle = planMarkdown ? proposedPlanTitle(planMarkdown) : null;
  const progressEntries = latestWorkLogEntries.slice(-4);
  const artifactItems = useMemo(
    () => collectArtifactItems({ activeProposedPlan, activeThread, gitStatus, turnDiffSummaries }),
    [activeProposedPlan, activeThread, gitStatus, turnDiffSummaries],
  );
  const visibleArtifactItems = artifactsExpanded ? artifactItems : artifactItems.slice(0, 8);
  const sourceItems = useMemo(
    () => collectSourceItems({ activeThread, providerSkills }),
    [activeThread, providerSkills],
  );
  const changes = changeSummary(gitStatus);
  const branchName = gitStatus?.branch ?? activeThread?.branch ?? null;
  const pullRequest = gitStatus?.pr ?? null;
  const showPlanHeader = Boolean(activePlan || planMarkdown);

  const handleCopyPlan = useCallback(() => {
    if (!planMarkdown) return;
    copyToClipboard(planMarkdown);
  }, [planMarkdown, copyToClipboard]);

  const handleDownload = useCallback(() => {
    if (!planMarkdown) return;
    const filename = buildProposedPlanMarkdownFilename(planMarkdown);
    downloadPlanAsTextFile(filename, normalizePlanMarkdownForExport(planMarkdown));
  }, [planMarkdown]);

  const handleSaveToWorkspace = useCallback(() => {
    const api = readEnvironmentApi(environmentId);
    if (!api || !workspaceRoot || !planMarkdown) return;
    const filename = buildProposedPlanMarkdownFilename(planMarkdown);
    setIsSavingToWorkspace(true);
    void api.projects
      .writeFile({
        cwd: workspaceRoot,
        relativePath: filename,
        contents: normalizePlanMarkdownForExport(planMarkdown),
      })
      .then((result) => {
        toastManager.add({
          type: "success",
          title: "Plan saved",
          description: result.relativePath,
        });
      })
      .catch((error) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not save plan",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      })
      .then(
        () => setIsSavingToWorkspace(false),
        () => setIsSavingToWorkspace(false),
      );
  }, [environmentId, planMarkdown, workspaceRoot]);

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-3 space-y-4">
        {showPlanHeader ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Badge
                variant="secondary"
                className="rounded-md bg-blue-500/10 px-1.5 py-0 text-[10px] font-semibold tracking-wide text-blue-400 uppercase"
              >
                {label}
              </Badge>
              {activePlan ? (
                <span className="truncate text-[11px] text-muted-foreground/60">
                  {formatTimestamp(activePlan.createdAt, timestampFormat)}
                </span>
              ) : null}
            </div>
            {planMarkdown ? (
              <Menu>
                <MenuTrigger
                  render={
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="text-muted-foreground/50 hover:text-foreground/70"
                      aria-label="Plan actions"
                    />
                  }
                >
                  <EllipsisIcon className="size-3.5" />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuItem onClick={handleCopyPlan}>
                    {isCopied ? "Copied!" : "Copy to clipboard"}
                  </MenuItem>
                  <MenuItem onClick={handleDownload}>Download as markdown</MenuItem>
                  <MenuItem
                    onClick={handleSaveToWorkspace}
                    disabled={!workspaceRoot || isSavingToWorkspace}
                  >
                    Save to workspace
                  </MenuItem>
                </MenuPopup>
              </Menu>
            ) : null}
          </div>
        ) : null}

        {activePlan?.explanation ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground/80">
            {activePlan.explanation}
          </p>
        ) : null}

        <div className="space-y-2">
          {sectionHeading("Progress")}
          {activePlan && activePlan.steps.length > 0 ? (
            <div className="space-y-1">
              {activePlan.steps.map((step) => (
                <div
                  key={`${step.status}:${step.step}`}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors duration-200",
                    step.status === "inProgress" && "bg-blue-500/5",
                    step.status === "completed" && "bg-emerald-500/5",
                  )}
                >
                  <div className="mt-0.5">{stepStatusIcon(step.status)}</div>
                  <p
                    className={cn(
                      "text-[13px] leading-snug",
                      step.status === "completed"
                        ? "text-muted-foreground/50 line-through decoration-muted-foreground/20"
                        : step.status === "inProgress"
                          ? "text-foreground/90"
                          : "text-muted-foreground/70",
                    )}
                  >
                    {step.step}
                  </p>
                </div>
              ))}
            </div>
          ) : progressEntries.length > 0 ? (
            <div className="space-y-1.5">
              {progressEntries.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 text-[13px]">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                  <span className="min-w-0 text-muted-foreground/75">
                    <span className="text-foreground/80">{entry.label}</span>
                    {entry.detail ? (
                      <span className="ml-1 text-muted-foreground/50">{entry.detail}</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground/40">
              Progress displayed for longer responses
            </p>
          )}
        </div>

        <div className="space-y-2">
          {sectionHeading("Branch details")}
          <div className="space-y-2">
            <div className="flex min-w-0 items-center gap-2 text-[13px]">
              <GithubIcon className="size-4 shrink-0 text-muted-foreground/60" />
              {pullRequest ? (
                <a
                  href={pullRequest.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate font-medium text-foreground hover:underline"
                  title={pullRequest.title}
                >
                  #{pullRequest.number} {pullRequest.title}
                </a>
              ) : (
                <span className="font-medium text-foreground">No pull request</span>
              )}
            </div>
            <div className="flex min-w-0 items-center gap-2 text-[13px]">
              <PencilIcon className="size-4 shrink-0 text-muted-foreground/60" />
              <span className="font-medium text-foreground">Changes</span>
              <span className="min-w-0 truncate text-muted-foreground/60">
                {changes ?? "Unavailable"}
              </span>
            </div>
            {branchName ? (
              <div className="flex min-w-0 items-center gap-2 pl-6 text-[12px] text-muted-foreground/50">
                <span className="truncate">{branchName}</span>
                {gitStatus && (gitStatus.aheadCount > 0 || gitStatus.behindCount > 0) ? (
                  <span className="shrink-0">
                    {gitStatus.aheadCount > 0 ? `↑${gitStatus.aheadCount}` : null}
                    {gitStatus.aheadCount > 0 && gitStatus.behindCount > 0 ? " " : null}
                    {gitStatus.behindCount > 0 ? `↓${gitStatus.behindCount}` : null}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {artifactItems.length > 0 ? (
          <div className="space-y-2">
            {sectionHeading("Artifacts")}
            <div className="space-y-1">
              {visibleArtifactItems.map((item) => (
                <div
                  key={item.id}
                  className="flex min-w-0 items-center gap-2 rounded-md py-1 text-[13px] text-foreground/90"
                  title={item.detail ?? item.label}
                >
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground/60" />
                  <span className="min-w-0 truncate font-medium">{item.label}</span>
                </div>
              ))}
            </div>
            {artifactItems.length > 8 ? (
              <button
                type="button"
                className="text-[12px] font-medium text-muted-foreground/50 hover:text-muted-foreground/80"
                onClick={() => setArtifactsExpanded((value) => !value)}
              >
                {artifactsExpanded ? "Show less" : `Show ${artifactItems.length - 8} more`}
              </button>
            ) : null}
          </div>
        ) : null}

        {sourceItems.length > 0 ? (
          <div className="space-y-2">
            {sectionHeading("Sources")}
            <div className="space-y-1.5">
              {sourceItems.map((item) => (
                <div key={item.id} className="flex min-w-0 items-center gap-2 text-[13px]">
                  {item.id === "web-search" ? (
                    <GlobeIcon className="size-4 shrink-0 text-muted-foreground/60" />
                  ) : (
                    <PackageIcon className="size-4 shrink-0 text-muted-foreground/60" />
                  )}
                  <span className="min-w-0 truncate font-medium text-foreground/90">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {planMarkdown ? (
          <div className="space-y-2">
            <button
              type="button"
              className="group flex w-full items-center gap-1.5 text-left"
              onClick={() => setProposedPlanExpanded((v) => !v)}
            >
              {proposedPlanExpanded ? (
                <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground/40 transition-transform" />
              ) : (
                <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground/40 transition-transform" />
              )}
              <span className="text-[10px] font-semibold tracking-widest text-muted-foreground/40 uppercase group-hover:text-muted-foreground/60">
                {planTitle ?? "Full Plan"}
              </span>
            </button>
            {proposedPlanExpanded ? (
              <div className="rounded-lg border border-border/50 bg-background/50 p-3">
                <ChatMarkdown
                  text={displayedPlanMarkdown ?? ""}
                  cwd={markdownCwd}
                  isStreaming={false}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </ScrollArea>
  );
});

const PlanSidebar = memo(function PlanSidebar({
  activePlan,
  activeProposedPlan,
  label = "Plan",
  environmentId,
  markdownCwd,
  workspaceRoot,
  timestampFormat,
  mode = "sidebar",
  onClose,
}: PlanSidebarProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col bg-card/50",
        mode === "sidebar"
          ? "h-full w-[340px] shrink-0 border-l border-border/70"
          : "h-full w-full",
      )}
    >
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-3">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="rounded-md bg-blue-500/10 px-1.5 py-0 text-[10px] font-semibold tracking-wide text-blue-400 uppercase"
          >
            {label}
          </Badge>
          {activePlan ? (
            <span className="text-[11px] text-muted-foreground/60">
              {formatTimestamp(activePlan.createdAt, timestampFormat)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onClose}
            aria-label={`Close ${label.toLowerCase()} sidebar`}
            className="text-muted-foreground/50 hover:text-foreground/70"
          >
            <PanelRightCloseIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      <PlanSummaryContent
        activePlan={activePlan}
        activeProposedPlan={activeProposedPlan}
        label={label}
        environmentId={environmentId}
        markdownCwd={markdownCwd}
        workspaceRoot={workspaceRoot}
        timestampFormat={timestampFormat}
      />
    </div>
  );
});

export default PlanSidebar;
export { PlanSummaryContent };
export type { PlanSidebarProps, PlanSummaryContentProps };
