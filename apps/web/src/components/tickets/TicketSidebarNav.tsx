import {
  ChevronDownIcon,
  ChevronRightIcon,
  InboxIcon,
  KanbanIcon,
  MilestoneIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";

import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { usePrimaryEnvironmentId } from "../../environments/primary";
import {
  ticketMilestonesListQueryOptions,
  ticketsListQueryOptions,
} from "../../lib/ticketReactQuery";
import {
  countActiveMilestones,
  countIssueTickets,
  countTriageTickets,
  encodeTicketScope,
  filterMilestonesForScope,
  filterTicketsForScope,
  getProjectIdsForTicketScope,
  TICKET_VIEWS,
  type TicketView,
} from "./ticketNavigation";
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "../ui/sidebar";

const VIEW_ICON: Record<TicketView, typeof InboxIcon> = {
  triage: InboxIcon,
  issues: KanbanIcon,
  projects: MilestoneIcon,
};

export function TicketSidebarNav(props: { projects: readonly SidebarProjectSnapshot[] }) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const pathname = useLocation({ select: (location) => location.pathname });
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<string>>(() => new Set());
  const ticketsQuery = useQuery(
    ticketsListQueryOptions({ environmentId: primaryEnvironmentId, filters: {} }),
  );
  const milestonesQuery = useQuery(
    ticketMilestonesListQueryOptions({ environmentId: primaryEnvironmentId, filters: {} }),
  );
  const tickets = ticketsQuery.data?.tickets ?? [];
  const milestones = milestonesQuery.data?.milestones ?? [];

  const sections = useMemo(
    () => [
      { key: "workspace", label: "Your Workspace" },
      ...props.projects.map((project) => ({ key: project.projectKey, label: project.displayName })),
    ],
    [props.projects],
  );

  const countFor = (scope: string, view: TicketView) => {
    if (!ticketsQuery.data || !milestonesQuery.data) {
      return null;
    }
    const projectIds = getProjectIdsForTicketScope({ projects: props.projects, scope });
    if (view === "projects") {
      return countActiveMilestones(filterMilestonesForScope(milestones, projectIds));
    }
    const scopedTickets = filterTicketsForScope(tickets, projectIds);
    return view === "triage" ? countTriageTickets(scopedTickets) : countIssueTickets(scopedTickets);
  };
  const toggleSection = (key: string) => {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between pl-2 pr-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Tickets
        </span>
      </div>
      <SidebarMenu>
        {sections.map((section) => {
          const collapsed = collapsedSections.has(section.key);
          const Chevron = collapsed ? ChevronRightIcon : ChevronDownIcon;
          return (
            <SidebarMenuItem key={section.key}>
              <SidebarMenuButton
                size="sm"
                className="h-7 px-2 text-xs font-medium text-muted-foreground"
                onClick={() => toggleSection(section.key)}
              >
                <Chevron className="size-3" />
                <span className="truncate">{section.label}</span>
              </SidebarMenuButton>
              {!collapsed ? (
                <SidebarMenuSub>
                  {TICKET_VIEWS.map((view) => {
                    const Icon = VIEW_ICON[view.id];
                    const scope = encodeTicketScope(section.key);
                    const to = "/tickets/$scope/$view" as const;
                    const active = pathname === `/tickets/${scope}/${view.id}`;
                    const count = countFor(section.key, view.id);
                    return (
                      <SidebarMenuSubItem key={view.id}>
                        <SidebarMenuSubButton
                          render={<Link to={to} params={{ scope, view: view.id }} />}
                          isActive={active}
                          className="relative"
                        >
                          <Icon className="size-3.5" />
                          <span className="truncate">{view.label}</span>
                          {count !== null && count > 0 ? (
                            <SidebarMenuBadge>{count}</SidebarMenuBadge>
                          ) : null}
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    );
                  })}
                </SidebarMenuSub>
              ) : null}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </div>
  );
}
