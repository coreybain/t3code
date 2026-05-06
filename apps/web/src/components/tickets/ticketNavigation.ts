import type { ProjectId, Ticket, TicketMilestone } from "@t3tools/contracts";

import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";

export type TicketView = "triage" | "issues" | "projects";
export type TicketDisplayMode = "kanban" | "list";

export const TICKET_VIEWS: ReadonlyArray<{
  readonly id: TicketView;
  readonly label: string;
}> = [
  { id: "triage", label: "Triage" },
  { id: "issues", label: "Issues" },
  { id: "projects", label: "Projects" },
];

export function isTicketView(value: string): value is TicketView {
  return value === "triage" || value === "issues" || value === "projects";
}

export function encodeTicketScope(scope: string): string {
  return encodeURIComponent(scope);
}

export function decodeTicketScope(scope: string): string {
  try {
    return decodeURIComponent(scope);
  } catch {
    return scope;
  }
}

export function getProjectIdsForTicketScope(input: {
  projects: readonly SidebarProjectSnapshot[];
  scope: string;
}): ReadonlySet<ProjectId> | null {
  if (input.scope === "workspace") {
    return null;
  }
  const project = input.projects.find((candidate) => candidate.projectKey === input.scope);
  if (!project) {
    return new Set();
  }
  return new Set(project.memberProjects.map((member) => member.id));
}

export function getTicketProjectKey(input: {
  physicalToLogicalProjectKey: ReadonlyMap<string, string>;
  projectId: ProjectId | null;
  projectPhysicalKeyById: ReadonlyMap<ProjectId, string>;
}): string {
  if (input.projectId === null) {
    return "workspace";
  }
  const physicalKey = input.projectPhysicalKeyById.get(input.projectId);
  if (!physicalKey) {
    return "workspace";
  }
  return input.physicalToLogicalProjectKey.get(physicalKey) ?? physicalKey;
}

export function buildProjectPhysicalKeyById(projects: readonly SidebarProjectSnapshot[]) {
  const result = new Map<ProjectId, string>();
  for (const project of projects) {
    for (const member of project.memberProjects) {
      result.set(member.id, member.physicalProjectKey);
    }
  }
  return result;
}

export function filterTicketsForScope(
  tickets: readonly Ticket[],
  projectIds: ReadonlySet<ProjectId> | null,
): Ticket[] {
  if (projectIds === null) {
    return [...tickets];
  }
  return tickets.filter((ticket) => ticket.projectId !== null && projectIds.has(ticket.projectId));
}

export function filterMilestonesForScope(
  milestones: readonly TicketMilestone[],
  projectIds: ReadonlySet<ProjectId> | null,
): TicketMilestone[] {
  if (projectIds === null) {
    return [...milestones];
  }
  return milestones.filter(
    (milestone) => milestone.projectId !== null && projectIds.has(milestone.projectId),
  );
}

export function countTriageTickets(tickets: readonly Ticket[]): number {
  return tickets.filter((ticket) => ticket.status === "triage").length;
}

export function countIssueTickets(tickets: readonly Ticket[]): number {
  return tickets.filter((ticket) => ticket.status !== "done" && ticket.status !== "canceled")
    .length;
}

export function countActiveMilestones(milestones: readonly TicketMilestone[]): number {
  return milestones.filter(
    (milestone) => milestone.status === "planned" || milestone.status === "active",
  ).length;
}

export function groupTicketsByProjectKey(input: {
  tickets: readonly Ticket[];
  physicalToLogicalProjectKey: ReadonlyMap<string, string>;
  projectPhysicalKeyById: ReadonlyMap<ProjectId, string>;
}) {
  const grouped = new Map<string, Ticket[]>();
  for (const ticket of input.tickets) {
    const key = getTicketProjectKey({
      physicalToLogicalProjectKey: input.physicalToLogicalProjectKey,
      projectId: ticket.projectId,
      projectPhysicalKeyById: input.projectPhysicalKeyById,
    });
    const existing = grouped.get(key);
    if (existing) {
      existing.push(ticket);
    } else {
      grouped.set(key, [ticket]);
    }
  }
  return grouped;
}
