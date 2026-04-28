import { memo } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ImageIcon,
  PenLineIcon,
  SendIcon,
  TerminalIcon,
  Trash2Icon,
} from "lucide-react";

import type { QueuedFollowUpMessage } from "../../followUpQueueStore";
import { formatInlineTerminalContextLabel } from "../../lib/terminalContext";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface QueuedFollowUpStackProps {
  messages: QueuedFollowUpMessage[];
  onEdit: (message: QueuedFollowUpMessage, index: number) => void;
  onSteer: (message: QueuedFollowUpMessage) => void;
  onMoveUp: (message: QueuedFollowUpMessage) => void;
  onMoveDown: (message: QueuedFollowUpMessage) => void;
  onDelete: (message: QueuedFollowUpMessage) => void;
}

function previewForMessage(message: QueuedFollowUpMessage): string {
  const promptPreview = message.prompt.replace(/\s+/g, " ").trim();
  if (promptPreview.length > 0) {
    return promptPreview;
  }
  if (message.attachments.length > 0) {
    return message.attachments.length === 1 ? (message.attachments[0]?.name ?? "Image") : "Images";
  }
  const firstContext = message.terminalContexts[0];
  if (firstContext) {
    return formatInlineTerminalContextLabel(firstContext);
  }
  return "Queued follow-up";
}

function IconButton(props: {
  label: string;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
            disabled={props.disabled}
            aria-label={props.label}
            onClick={props.onClick}
          />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipPopup side="top">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

export const QueuedFollowUpStack = memo(function QueuedFollowUpStack({
  messages,
  onEdit,
  onSteer,
  onMoveUp,
  onMoveDown,
  onDelete,
}: QueuedFollowUpStackProps) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="mb-1.5 grid gap-1" data-follow-up-queue-stack="true">
      {messages.map((message, index) => (
        <div
          key={message.id}
          className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-card/95 px-2 py-1 shadow-sm"
          data-follow-up-queue-card="true"
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="min-w-0 truncate text-[11px] leading-4 text-foreground/85">
              {previewForMessage(message)}
            </span>
            {message.attachments.length > 0 ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
                <ImageIcon className="size-3" />
                {message.attachments.length}
              </span>
            ) : null}
            {message.terminalContexts.length > 0 ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
                <TerminalIcon className="size-3" />
                {message.terminalContexts.length}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label="Edit queued follow-up" onClick={() => onEdit(message, index)}>
              <PenLineIcon className="size-3.5" />
            </IconButton>
            <IconButton label="Steer with queued follow-up" onClick={() => onSteer(message)}>
              <SendIcon className="size-3.5 text-blue-500" />
            </IconButton>
            <IconButton
              label="Move queued follow-up up"
              disabled={index === 0}
              onClick={() => onMoveUp(message)}
            >
              <ArrowUpIcon className={cn("size-3.5", index === 0 ? "opacity-40" : "")} />
            </IconButton>
            <IconButton
              label="Move queued follow-up down"
              disabled={index === messages.length - 1}
              onClick={() => onMoveDown(message)}
            >
              <ArrowDownIcon
                className={cn("size-3.5", index === messages.length - 1 ? "opacity-40" : "")}
              />
            </IconButton>
            <IconButton label="Delete queued follow-up" onClick={() => onDelete(message)}>
              <Trash2Icon className="size-3.5 text-rose-500" />
            </IconButton>
          </div>
        </div>
      ))}
    </div>
  );
});
