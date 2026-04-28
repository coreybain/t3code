import type { CodexUsageSnapshot, UsageLimitBucket, UsageLimitWindow } from "@t3tools/contracts";
import { AlertCircleIcon, ArrowRightIcon } from "lucide-react";

import { useCodexUsage } from "../../lib/usageReactQuery";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import {
  SettingsPageContainer,
  SettingsSection,
  useRelativeTimeTick,
} from "../settings/settingsLayout";

type UsageWindowKind = "primary" | "secondary";

const WINDOW_LABELS: Record<UsageWindowKind, string> = {
  primary: "5 hour usage limit",
  secondary: "Weekly usage limit",
};

export function getUsageRemainingPercent(window: UsageLimitWindow | null | undefined): number {
  if (!window) return 0;
  return Math.max(0, Math.min(100, 100 - window.usedPercent));
}

export function findSparkUsageBucket(snapshot: CodexUsageSnapshot | undefined | null) {
  return (
    snapshot?.buckets.find((bucket) => {
      const searchable = `${bucket.id} ${bucket.name}`.toLowerCase();
      return searchable.includes("spark");
    }) ?? null
  );
}

function formatResetLabel(resetsAt: number | null | undefined, nowMs: number) {
  if (!resetsAt) return "Reset unavailable";

  const resetDate = new Date(resetsAt);
  if (Number.isNaN(resetDate.getTime())) return "Reset unavailable";

  const nowDate = new Date(nowMs);
  const sameDay =
    resetDate.getFullYear() === nowDate.getFullYear() &&
    resetDate.getMonth() === nowDate.getMonth() &&
    resetDate.getDate() === nowDate.getDate();

  if (sameDay) {
    return `Resets ${new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(resetDate)}`;
  }

  return `Resets ${new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(resetDate)}`;
}

function getErrorDetail(error: unknown) {
  if (error && typeof error === "object" && "detail" in error) {
    const detail = (error as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  if (error instanceof Error) return error.message;
  return "Codex usage could not be loaded.";
}

export function UsageLimitBar({
  remainingPercent,
  className,
}: {
  remainingPercent: number;
  className?: string;
}) {
  return (
    <div className={cn("h-1.5 w-28 overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full rounded-full bg-foreground transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(100, remainingPercent))}%` }}
      />
    </div>
  );
}

function UsageLimitRow({
  bucket,
  kind,
  compact = false,
}: {
  bucket: UsageLimitBucket | null;
  kind: UsageWindowKind;
  compact?: boolean;
}) {
  const nowMs = useRelativeTimeTick(30_000);
  const window = bucket?.[kind] ?? null;
  const remainingPercent = getUsageRemainingPercent(window);

  if (compact) {
    return (
      <div className="min-w-0 space-y-1.5 border-t border-border/60 py-2.5 first:border-t-0">
        <div className="truncate text-xs font-semibold text-foreground">{WINDOW_LABELS[kind]}</div>
        <div className="flex min-w-0 items-center gap-2">
          <UsageLimitBar remainingPercent={remainingPercent} className="min-w-0 flex-1" />
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
            {window ? `${Math.round(remainingPercent)}% left` : "N/A"}
          </span>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {window ? formatResetLabel(window.resetsAt, nowMs) : "Unavailable"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center justify-between gap-4 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{WINDOW_LABELS[kind]}</div>
        <div className="text-xs text-muted-foreground">
          {window ? formatResetLabel(window.resetsAt, nowMs) : "Unavailable"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <UsageLimitBar remainingPercent={remainingPercent} className="w-28 sm:w-36" />
        <span className="w-14 text-right text-sm font-medium text-muted-foreground">
          {window ? `${Math.round(remainingPercent)}% left` : "N/A"}
        </span>
      </div>
    </div>
  );
}

export function UsageLimitRows({
  bucket,
  compact = false,
}: {
  bucket: UsageLimitBucket | null;
  compact?: boolean;
}) {
  return (
    <>
      <UsageLimitRow bucket={bucket} kind="primary" compact={compact} />
      <UsageLimitRow bucket={bucket} kind="secondary" compact={compact} />
    </>
  );
}

function UsageRowsSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <>
      {(["primary", "secondary"] as const).map((kind) => (
        <div
          key={kind}
          className={cn(
            "flex items-center justify-between gap-4 border-t border-border/60 first:border-t-0",
            compact ? "py-2.5" : "px-4 py-4 sm:px-5",
          )}
        >
          <div className="space-y-2">
            <Skeleton className={cn("h-3.5 rounded-full", compact ? "w-24" : "w-32")} />
            <Skeleton className={cn("h-3 rounded-full", compact ? "w-16" : "w-20")} />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className={cn("h-1.5 rounded-full", compact ? "w-16" : "w-32")} />
            <Skeleton className="h-3 w-10 rounded-full" />
          </div>
        </div>
      ))}
    </>
  );
}

export function SidebarUsageMonitor({ onLearnMore }: { onLearnMore: () => void }) {
  const query = useCodexUsage();

  return (
    <div className="mb-2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-foreground">Usage</div>
        <Button size="xs" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={onLearnMore}>
          Learn more
          <ArrowRightIcon className="size-3" />
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border border-border/60 px-3">
        {query.isPending ? (
          <UsageRowsSkeleton compact />
        ) : query.isError ? (
          <div className="space-y-2 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <AlertCircleIcon className="size-3.5 text-muted-foreground" />
              Usage unavailable
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {getErrorDetail(query.error)}
            </p>
          </div>
        ) : (
          <UsageLimitRows bucket={query.data.main} compact />
        )}
      </div>
    </div>
  );
}

function UsageUnavailablePanel({ detail }: { detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4 text-card-foreground">
      <div className="flex items-start gap-3">
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Usage unavailable</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function UsageBucketSection({
  title,
  bucket,
  isLoading,
}: {
  title: string;
  bucket: UsageLimitBucket | null;
  isLoading: boolean;
}) {
  return (
    <SettingsSection title={title}>
      {isLoading ? <UsageRowsSkeleton /> : <UsageLimitRows bucket={bucket} />}
    </SettingsSection>
  );
}

export function UsageSettingsPanel() {
  const query = useCodexUsage();
  const sparkBucket = findSparkUsageBucket(query.data);

  return (
    <SettingsPageContainer>
      <div className="px-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Usage</h1>
      </div>

      {query.isError ? (
        <UsageUnavailablePanel detail={getErrorDetail(query.error)} />
      ) : (
        <>
          <UsageBucketSection
            title="General usage limits"
            bucket={query.data?.main ?? null}
            isLoading={query.isPending}
          />
          <UsageBucketSection
            title="GPT-5.3-Codex-Spark usage limits"
            bucket={sparkBucket}
            isLoading={query.isPending}
          />
        </>
      )}
    </SettingsPageContainer>
  );
}
