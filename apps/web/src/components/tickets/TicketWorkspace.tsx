import type { ProjectId, Ticket } from "@t3tools/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { usePrimaryEnvironmentId } from "../../environments/primary";
import {
  useSavedEnvironmentRegistryStore,
  useSavedEnvironmentRuntimeStore,
} from "../../environments/runtime";
import { useSettings } from "../../hooks/useSettings";
import {
  archiveTicket,
  ticketMilestonesListQueryOptions,
  ticketsListQueryOptions,
  updateTicket,
} from "../../lib/ticketReactQuery";
import { selectProjectsAcrossEnvironments, useStore } from "../../store";
import { buildSidebarProjectSnapshots } from "../../sidebarProjectGrouping";
import { SidebarInset } from "../ui/sidebar";
import { TicketIssuesView } from "./TicketIssuesView";
import { TicketProjectsPlaceholder } from "./TicketProjectsPlaceholder";
import { TicketTriageView } from "./TicketTriageView";
import {
  decodeTicketScope,
  filterMilestonesForScope,
  filterTicketsForScope,
  getProjectIdsForTicketScope,
  type TicketDisplayMode,
  type TicketView,
} from "./ticketNavigation";

export function TicketWorkspace(props: {
  scope: string;
  view: TicketView;
  ticketId?: string | undefined;
  display: TicketDisplayMode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projects = useStore(useShallow(selectProjectsAcrossEnvironments));
  const projectGroupingSettings = useSettings((settings) => ({
    sidebarProjectGroupingMode: settings.sidebarProjectGroupingMode,
    sidebarProjectGroupingOverrides: settings.sidebarProjectGroupingOverrides,
  }));
  const savedEnvironmentRegistry = useSavedEnvironmentRegistryStore((s) => s.byId);
  const savedEnvironmentRuntimeById = useSavedEnvironmentRuntimeStore((s) => s.byId);
  const decodedScope = decodeTicketScope(props.scope);

  const sidebarProjects = useMemo(
    () =>
      buildSidebarProjectSnapshots({
        projects,
        settings: projectGroupingSettings,
        primaryEnvironmentId,
        resolveEnvironmentLabel: (environmentId) =>
          savedEnvironmentRuntimeById[environmentId]?.descriptor?.label ??
          savedEnvironmentRegistry[environmentId]?.label ??
          null,
      }),
    [
      primaryEnvironmentId,
      projectGroupingSettings,
      projects,
      savedEnvironmentRegistry,
      savedEnvironmentRuntimeById,
    ],
  );
  const projectIdsForScope = useMemo(
    () => getProjectIdsForTicketScope({ projects: sidebarProjects, scope: decodedScope }),
    [decodedScope, sidebarProjects],
  );

  const ticketsQuery = useQuery(
    ticketsListQueryOptions({ environmentId: primaryEnvironmentId, filters: {} }),
  );
  const milestonesQuery = useQuery(
    ticketMilestonesListQueryOptions({ environmentId: primaryEnvironmentId, filters: {} }),
  );

  const scopedTickets = useMemo(
    () => filterTicketsForScope(ticketsQuery.data?.tickets ?? [], projectIdsForScope),
    [projectIdsForScope, ticketsQuery.data?.tickets],
  );
  const scopedMilestones = useMemo(
    () => filterMilestonesForScope(milestonesQuery.data?.milestones ?? [], projectIdsForScope),
    [milestonesQuery.data?.milestones, projectIdsForScope],
  );
  const triageTickets = useMemo(
    () => scopedTickets.filter((ticket) => ticket.status === "triage"),
    [scopedTickets],
  );
  const visibleTickets = props.view === "triage" ? triageTickets : scopedTickets;
  const selectedTicket =
    visibleTickets.find((ticket) => ticket.id === props.ticketId) ?? visibleTickets[0] ?? null;

  useEffect(() => {
    if (props.ticketId || !selectedTicket || props.view === "projects") {
      return;
    }
    void navigate({
      to: "/tickets/$scope/$view",
      params: { scope: props.scope, view: props.view },
      search: (previous) => ({ ...previous, ticketId: selectedTicket.id }),
      replace: true,
    });
  }, [navigate, props.scope, props.ticketId, props.view, selectedTicket]);

  const projectNameById = useMemo(() => {
    const map = new Map<ProjectId, string>();
    for (const project of sidebarProjects) {
      for (const member of project.memberProjects) {
        map.set(member.id, project.displayName);
      }
    }
    return map;
  }, [sidebarProjects]);
  const projectName = (projectId: Ticket["projectId"]) =>
    projectId ? (projectNameById.get(projectId) ?? "Project") : "Your Workspace";

  const selectTicket = (ticket: Ticket) => {
    void navigate({
      to: "/tickets/$scope/$view",
      params: { scope: props.scope, view: props.view },
      search: (previous) => ({ ...previous, ticketId: ticket.id }),
    });
  };
  const updateSelectedTicket = (
    input: Partial<Pick<Ticket, "title" | "description" | "status" | "priority">>,
  ) => {
    if (!primaryEnvironmentId || !selectedTicket) return;
    void updateTicket({
      environmentId: primaryEnvironmentId,
      payload: { id: selectedTicket.id, ...input },
      queryClient,
    });
  };
  const archiveSelectedTicket = (ticket: Ticket) => {
    if (!primaryEnvironmentId) return;
    void archiveTicket({
      environmentId: primaryEnvironmentId,
      payload: { id: ticket.id },
      queryClient,
    });
  };
  const changeDisplay = (display: TicketDisplayMode) => {
    void navigate({
      to: "/tickets/$scope/$view",
      params: { scope: props.scope, view: props.view },
      search: (previous) => ({ ...previous, display }),
    });
  };

  if (!primaryEnvironmentId) {
    return (
      <SidebarInset className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Ticket data is unavailable.
      </SidebarInset>
    );
  }

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      {props.view === "triage" ? (
        <TicketTriageView
          tickets={triageTickets}
          selectedTicket={selectedTicket}
          environmentId={primaryEnvironmentId}
          projectName={projectName}
          onSelectTicket={selectTicket}
          onUpdateTicket={updateSelectedTicket}
          onArchiveTicket={archiveSelectedTicket}
        />
      ) : props.view === "issues" ? (
        <TicketIssuesView
          tickets={scopedTickets}
          selectedTicket={selectedTicket}
          display={props.display}
          environmentId={primaryEnvironmentId}
          projectName={projectName}
          onDisplayChange={changeDisplay}
          onSelectTicket={selectTicket}
          onUpdateTicket={updateSelectedTicket}
          onArchiveTicket={archiveSelectedTicket}
        />
      ) : (
        <TicketProjectsPlaceholder milestones={scopedMilestones} />
      )}
    </SidebarInset>
  );
}
