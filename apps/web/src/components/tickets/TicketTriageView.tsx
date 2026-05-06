import type { Ticket } from "@t3tools/contracts";

import { TicketCard } from "./TicketCard";
import { TicketDetailPanel } from "./TicketDetailPanel";

export function TicketTriageView(props: {
  tickets: readonly Ticket[];
  selectedTicket: Ticket | null;
  environmentId: import("@t3tools/contracts").EnvironmentId;
  projectName: (projectId: Ticket["projectId"]) => string;
  onSelectTicket: (ticket: Ticket) => void;
  onUpdateTicket: (
    input: Partial<Pick<Ticket, "title" | "description" | "status" | "priority">>,
  ) => void;
  onArchiveTicket: (ticket: Ticket) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-h-0 w-[clamp(18rem,28vw,26rem)] shrink-0 flex-col border-border border-r bg-card/30">
        <div className="flex h-12 shrink-0 items-center justify-between border-border border-b px-4">
          <h1 className="text-sm font-medium text-foreground">Triage</h1>
          <span className="text-xs tabular-nums text-muted-foreground">{props.tickets.length}</span>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {props.tickets.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No triage tickets
            </div>
          ) : (
            props.tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                active={props.selectedTicket?.id === ticket.id}
                onClick={() => props.onSelectTicket(ticket)}
              />
            ))
          )}
        </div>
      </section>
      <TicketDetailPanel
        ticket={props.selectedTicket}
        environmentId={props.environmentId}
        projectName={props.projectName(props.selectedTicket?.projectId ?? null)}
        onUpdate={props.onUpdateTicket}
        onArchive={props.onArchiveTicket}
      />
    </div>
  );
}
