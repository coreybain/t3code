import type { Ticket } from "@t3tools/contracts";
import { AlertCircleIcon, CircleDotIcon } from "lucide-react";

import { cn } from "../../lib/utils";

const PRIORITY_LABEL: Record<Ticket["priority"], string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const STATUS_LABEL: Record<Ticket["status"], string> = {
  triage: "Triage",
  backlog: "Backlog",
  pending: "Pending",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  canceled: "Canceled",
};

export function ticketStatusLabel(status: Ticket["status"]): string {
  return STATUS_LABEL[status];
}

export function ticketPriorityLabel(priority: Ticket["priority"]): string {
  return PRIORITY_LABEL[priority];
}

export function ticketStatusDotClassName(status: Ticket["status"]): string {
  switch (status) {
    case "triage":
      return "text-warning";
    case "backlog":
      return "text-muted-foreground";
    case "pending":
      return "text-info";
    case "in_progress":
      return "text-primary";
    case "review":
      return "text-violet-500";
    case "done":
      return "text-success";
    case "canceled":
      return "text-destructive";
  }
}

export function TicketCard(props: {
  ticket: Ticket;
  active?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const { ticket, active, compact, onClick } = props;
  return (
    <button
      type="button"
      className={cn(
        "group flex w-full min-w-0 cursor-pointer flex-col gap-2 rounded-md border border-border/70 bg-card px-3 py-3 text-left transition-colors hover:border-border hover:bg-accent/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        active && "border-ring/60 bg-accent/60",
        compact && "py-2.5",
      )}
      onClick={onClick}
    >
      <div className="flex min-w-0 items-start gap-2">
        <CircleDotIcon
          className={cn("mt-0.5 size-3.5 shrink-0", ticketStatusDotClassName(ticket.status))}
        />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {ticket.title}
          </div>
          {ticket.description ? (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {ticket.description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 pl-5 text-[11px] text-muted-foreground">
        <span>{ticketStatusLabel(ticket.status)}</span>
        {ticket.priority !== "none" ? (
          <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-foreground/80">
            <AlertCircleIcon className="size-3" />
            {ticketPriorityLabel(ticket.priority)}
          </span>
        ) : null}
        {ticket.labels.slice(0, 2).map((label) => (
          <span key={label} className="rounded-sm bg-secondary px-1.5 py-0.5">
            {label}
          </span>
        ))}
      </div>
    </button>
  );
}
