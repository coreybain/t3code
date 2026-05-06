import { createFileRoute, retainSearchParams } from "@tanstack/react-router";

import { TicketWorkspace } from "../components/tickets/TicketWorkspace";
import {
  isTicketView,
  type TicketDisplayMode,
  type TicketView,
} from "../components/tickets/ticketNavigation";

export interface TicketRouteSearch {
  readonly ticketId?: string | undefined;
  readonly display?: TicketDisplayMode | undefined;
}

function parseTicketSearch(search: Record<string, unknown>): TicketRouteSearch {
  return {
    ticketId: typeof search.ticketId === "string" ? search.ticketId : undefined,
    display:
      search.display === "list" ? "list" : search.display === "kanban" ? "kanban" : undefined,
  };
}

function TicketRouteView() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const view: TicketView = isTicketView(params.view) ? params.view : "triage";
  return (
    <TicketWorkspace
      scope={params.scope}
      view={view}
      ticketId={search.ticketId}
      display={search.display ?? "kanban"}
    />
  );
}

export const Route = createFileRoute("/_chat/tickets/$scope/$view")({
  validateSearch: parseTicketSearch,
  search: {
    middlewares: [retainSearchParams<TicketRouteSearch>(["ticketId", "display"])],
  },
  component: TicketRouteView,
});
