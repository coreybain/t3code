import type { Ticket } from "@t3tools/contracts";
import { CircleDotIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { ticketPriorityLabel, ticketStatusDotClassName, ticketStatusLabel } from "./TicketCard";

function formatTicketDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function TicketListRow(props: {
  ticket: Ticket;
  projectName?: string;
  active?: boolean;
  onClick: () => void;
}) {
  const { ticket, projectName, active, onClick } = props;
  return (
    <button
      type="button"
      className={cn(
        "grid w-full min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-border/70 border-b px-3 py-2.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-accent/60",
      )}
      onClick={onClick}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <CircleDotIcon
          className={cn("size-3.5 shrink-0", ticketStatusDotClassName(ticket.status))}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{ticket.title}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span>{ticketStatusLabel(ticket.status)}</span>
            {projectName ? <span className="truncate">{projectName}</span> : null}
            {ticket.priority !== "none" ? (
              <span>{ticketPriorityLabel(ticket.priority)}</span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        {ticket.labels.slice(0, 2).map((label) => (
          <span key={label} className="hidden rounded-sm bg-secondary px-1.5 py-0.5 sm:inline-flex">
            {label}
          </span>
        ))}
        <span>{formatTicketDate(ticket.updatedAt)}</span>
      </div>
    </button>
  );
}
