import type { Ticket, TicketStatus } from "@t3tools/contracts";
import {
  Columns3Icon,
  ListIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import { useState } from "react";

import { useSidebar } from "../ui/sidebar";
import type { TicketDisplayMode } from "./ticketNavigation";
import { TicketDetailPanel } from "./TicketDetailPanel";
import { TicketListRow } from "./TicketListRow";
import { TicketStatusColumn } from "./TicketStatusColumn";

const BOARD_STATUSES: TicketStatus[] = ["backlog", "pending", "in_progress", "review", "done"];

export function TicketIssuesView(props: {
  tickets: readonly Ticket[];
  selectedTicket: Ticket | null;
  display: TicketDisplayMode;
  environmentId: import("@t3tools/contracts").EnvironmentId;
  projectName: (projectId: Ticket["projectId"]) => string;
  onDisplayChange: (display: TicketDisplayMode) => void;
  onSelectTicket: (ticket: Ticket) => void;
  onUpdateTicket: (
    input: Partial<Pick<Ticket, "title" | "description" | "status" | "priority">>,
  ) => void;
  onArchiveTicket: (ticket: Ticket) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(Boolean(props.selectedTicket));
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar();
  const boardTickets = props.tickets.filter(
    (ticket) => ticket.status !== "triage" && ticket.status !== "canceled",
  );
  const selectTicket = (ticket: Ticket) => {
    props.onSelectTicket(ticket);
    setDetailOpen(true);
  };

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-border border-b px-4">
          <div className="flex min-w-0 items-center gap-2">
            {!sidebarOpen ? (
              <button
                type="button"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <PanelLeftOpenIcon className="size-4" />
              </button>
            ) : null}
            <div className="min-w-0">
              <h1 className="text-sm font-medium text-foreground">Issues</h1>
              <p className="text-xs text-muted-foreground">{boardTickets.length} active tickets</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex rounded-md border border-border bg-card p-0.5">
              <button
                type="button"
                className={`inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs ${
                  props.display === "kanban" ? "bg-accent text-foreground" : "text-muted-foreground"
                }`}
                onClick={() => props.onDisplayChange("kanban")}
              >
                <Columns3Icon className="size-3.5" />
                Kanban
              </button>
              <button
                type="button"
                className={`inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs ${
                  props.display === "list" ? "bg-accent text-foreground" : "text-muted-foreground"
                }`}
                onClick={() => props.onDisplayChange("list")}
              >
                <ListIcon className="size-3.5" />
                List
              </button>
            </div>
            <button
              type="button"
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs transition-colors ${
                detailOpen ? "bg-accent text-foreground" : "bg-card text-muted-foreground"
              }`}
              onClick={() => setDetailOpen((open) => !open)}
            >
              {detailOpen ? (
                <PanelRightCloseIcon className="size-3.5" />
              ) : (
                <PanelRightOpenIcon className="size-3.5" />
              )}
              Details
            </button>
          </div>
        </div>
        {props.display === "kanban" ? (
          <div className="flex min-h-0 flex-1 overflow-x-auto">
            {BOARD_STATUSES.map((status) => (
              <TicketStatusColumn
                key={status}
                status={status}
                tickets={boardTickets.filter((ticket) => ticket.status === status)}
                activeTicketId={props.selectedTicket?.id ?? null}
                onSelectTicket={selectTicket}
              />
            ))}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {boardTickets.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No issues</div>
            ) : (
              boardTickets.map((ticket) => (
                <TicketListRow
                  key={ticket.id}
                  ticket={ticket}
                  projectName={props.projectName(ticket.projectId)}
                  active={props.selectedTicket?.id === ticket.id}
                  onClick={() => selectTicket(ticket)}
                />
              ))
            )}
          </div>
        )}
      </main>
      <div
        className={`absolute inset-y-0 right-0 z-20 hidden w-[min(34rem,42vw)] border-border border-l bg-background shadow-2xl transition-transform duration-150 lg:flex ${
          detailOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <TicketDetailPanel
          ticket={props.selectedTicket}
          environmentId={props.environmentId}
          projectName={props.projectName(props.selectedTicket?.projectId ?? null)}
          onUpdate={props.onUpdateTicket}
          onArchive={props.onArchiveTicket}
          onClose={() => setDetailOpen(false)}
        />
      </div>
    </div>
  );
}
