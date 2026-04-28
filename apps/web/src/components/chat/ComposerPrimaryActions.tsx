import { memo } from "react";
import { ChevronDownIcon, ChevronLeftIcon } from "lucide-react";
import { cn, isMacPlatform } from "~/lib/utils";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { FollowUpSubmitMode } from "../../followUpQueueStore";

interface PendingActionState {
  questionIndex: number;
  isLastQuestion: boolean;
  canAdvance: boolean;
  isResponding: boolean;
  isComplete: boolean;
}

interface ComposerPrimaryActionsProps {
  compact: boolean;
  pendingAction: PendingActionState | null;
  isRunning: boolean;
  showPlanFollowUpPrompt: boolean;
  promptHasText: boolean;
  isSendBusy: boolean;
  isConnecting: boolean;
  isPreparingWorktree: boolean;
  hasSendableContent: boolean;
  followUpSendMode: FollowUpSubmitMode;
  onPreviousPendingQuestion: () => void;
  onInterrupt: () => void;
  onImplementPlanInNewThread: () => void;
}

export const formatPendingPrimaryActionLabel = (input: {
  compact: boolean;
  isLastQuestion: boolean;
  isResponding: boolean;
  questionIndex: number;
}) => {
  if (input.isResponding) {
    return "Submitting...";
  }
  if (input.compact) {
    return input.isLastQuestion ? "Submit" : "Next";
  }
  if (!input.isLastQuestion) {
    return "Next question";
  }
  return input.questionIndex > 0 ? "Submit answers" : "Submit answer";
};

export function getRunningPrimaryAction(input: {
  hasSendableContent: boolean;
  followUpSendMode: FollowUpSubmitMode;
}): {
  kind: "stop" | FollowUpSubmitMode;
  ariaLabel: string;
  className: string;
} {
  if (!input.hasSendableContent) {
    return {
      kind: "stop",
      ariaLabel: "Stop generation",
      className: "bg-rose-500/90 text-white hover:bg-rose-500",
    };
  }
  if (input.followUpSendMode === "steer") {
    return {
      kind: "steer",
      ariaLabel: "Steer with follow-up message",
      className: "bg-blue-500/90 text-white hover:bg-blue-500",
    };
  }
  return {
    kind: "queue",
    ariaLabel: "Queue follow-up message",
    className: "bg-emerald-500/90 text-white hover:bg-emerald-500",
  };
}

function alternateSubmitLabel(): string {
  return isMacPlatform(navigator.platform) ? "⌘+Enter" : "Ctrl+Enter";
}

function primaryActionTooltip(input: {
  isRunning: boolean;
  hasSendableContent: boolean;
  followUpSendMode: FollowUpSubmitMode;
}): string {
  if (!input.isRunning) {
    return "Send message";
  }
  if (!input.hasSendableContent) {
    return "Cancel";
  }
  const alternateLabel = alternateSubmitLabel();
  if (input.followUpSendMode === "queue") {
    return `Queue message. ${alternateLabel} sends now.`;
  }
  return `Send now. ${alternateLabel} queues it.`;
}

export const ComposerPrimaryActions = memo(function ComposerPrimaryActions({
  compact,
  pendingAction,
  isRunning,
  showPlanFollowUpPrompt,
  promptHasText,
  isSendBusy,
  isConnecting,
  isPreparingWorktree,
  hasSendableContent,
  followUpSendMode,
  onPreviousPendingQuestion,
  onInterrupt,
  onImplementPlanInNewThread,
}: ComposerPrimaryActionsProps) {
  if (pendingAction) {
    return (
      <div className={cn("flex items-center justify-end", compact ? "gap-1.5" : "gap-2")}>
        {pendingAction.questionIndex > 0 ? (
          compact ? (
            <Button
              size="icon-sm"
              variant="outline"
              className="rounded-full"
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
              aria-label="Previous question"
            >
              <ChevronLeftIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
            >
              Previous
            </Button>
          )
        ) : null}
        <Button
          type="submit"
          size="sm"
          className={cn("rounded-full", compact ? "px-3" : "px-4")}
          disabled={
            pendingAction.isResponding ||
            (pendingAction.isLastQuestion ? !pendingAction.isComplete : !pendingAction.canAdvance)
          }
        >
          {formatPendingPrimaryActionLabel({
            compact,
            isLastQuestion: pendingAction.isLastQuestion,
            isResponding: pendingAction.isResponding,
            questionIndex: pendingAction.questionIndex,
          })}
        </Button>
      </div>
    );
  }

  if (isRunning) {
    const runningAction = getRunningPrimaryAction({ hasSendableContent, followUpSendMode });
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type={runningAction.kind === "stop" ? "button" : "submit"}
              className={cn(
                "flex size-8 cursor-pointer items-center justify-center rounded-full transition-all duration-150 hover:scale-105 sm:h-8 sm:w-8",
                runningAction.className,
              )}
              onClick={runningAction.kind === "stop" ? onInterrupt : undefined}
              aria-label={runningAction.ariaLabel}
            />
          }
        >
          {runningAction.kind === "stop" ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <rect x="2" y="2" width="8" height="8" rx="1.5" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </TooltipTrigger>
        <TooltipPopup side="top">
          {primaryActionTooltip({ isRunning, hasSendableContent, followUpSendMode })}
        </TooltipPopup>
      </Tooltip>
    );
  }

  if (showPlanFollowUpPrompt) {
    if (promptHasText) {
      return (
        <Button
          type="submit"
          size="sm"
          className={cn("rounded-full", compact ? "h-9 px-3 sm:h-8" : "h-9 px-4 sm:h-8")}
          disabled={isSendBusy || isConnecting}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Refine"}
        </Button>
      );
    }

    return (
      <div data-chat-composer-implement-actions="true" className="flex items-center justify-end">
        <Button
          type="submit"
          size="sm"
          className="h-9 rounded-l-full rounded-r-none px-4 sm:h-8"
          disabled={isSendBusy || isConnecting}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Implement"}
        </Button>
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="sm"
                variant="default"
                className="h-9 rounded-l-none rounded-r-full border-l-white/12 px-2 sm:h-8"
                aria-label="Implementation actions"
                disabled={isSendBusy || isConnecting}
              />
            }
          >
            <ChevronDownIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" side="top">
            <MenuItem
              disabled={isSendBusy || isConnecting}
              onClick={() => void onImplementPlanInNewThread()}
            >
              Implement in a new thread
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="submit"
            className="flex h-9 w-9 enabled:cursor-pointer items-center justify-center rounded-full bg-primary/90 text-primary-foreground transition-all duration-150 hover:bg-primary hover:scale-105 disabled:pointer-events-none disabled:opacity-30 disabled:hover:scale-100 sm:h-8 sm:w-8"
            disabled={isSendBusy || isConnecting || !hasSendableContent}
            aria-label={
              isConnecting
                ? "Connecting"
                : isPreparingWorktree
                  ? "Preparing worktree"
                  : isSendBusy
                    ? "Sending"
                    : "Send message"
            }
          />
        }
      >
        {isConnecting || isSendBusy ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="animate-spin"
            aria-hidden="true"
          >
            <circle
              cx="7"
              cy="7"
              r="5.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="20 12"
            />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </TooltipTrigger>
      <TooltipPopup side="top">
        {primaryActionTooltip({ isRunning, hasSendableContent, followUpSendMode })}
      </TooltipPopup>
    </Tooltip>
  );
});
