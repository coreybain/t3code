import type { Ticket } from "@t3tools/contracts";

import { TicketCard, ticketStatusLabel } from "./TicketCard";

export function TicketStatusColumn(props: {
  status: Ticket["status"];
  tickets: readonly Ticket[];
  activeTicketId: string | null;
  onSelectTicket: (ticket: Ticket) => void;
}) {
  return (
    <section className="flex min-h-0 w-80 shrink-0 flex-col border-border/70 border-r bg-background/40">
      <div className="flex h-11 shrink-0 items-center justify-between border-border/70 border-b px-3">
        <h2 className="text-sm font-medium text-foreground">{ticketStatusLabel(props.status)}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{props.tickets.length}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {props.tickets.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Empty
          </div>
        ) : (
          props.tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              active={props.activeTicketId === ticket.id}
              compact
              onClick={() => props.onSelectTicket(ticket)}
            />
          ))
        )}
      </div>
    </section>
  );
}
