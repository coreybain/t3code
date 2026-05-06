import { describe, expect, it } from "vitest";
import { EnvironmentId, ProjectId, type Ticket, type TicketMilestone } from "@t3tools/contracts";

import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import {
  countActiveMilestones,
  countIssueTickets,
  countTriageTickets,
  filterMilestonesForScope,
  filterTicketsForScope,
  getProjectIdsForTicketScope,
} from "./ticketNavigation";

const projectId = ProjectId.make("project-1");
const environmentId = EnvironmentId.make("env-1");

const projects: SidebarProjectSnapshot[] = [
  {
    id: projectId,
    environmentId,
    name: "QuoteCloud",
    cwd: "/repo",
    defaultModelSelection: null,
    scripts: [],
    projectKey: "logical:quotecloud",
    displayName: "QuoteCloud",
    groupedProjectCount: 1,
    environmentPresence: "local-only",
    memberProjects: [
      {
        id: projectId,
        environmentId,
        name: "QuoteCloud",
        cwd: "/repo",
        defaultModelSelection: null,
        scripts: [],
        physicalProjectKey: "physical:quotecloud",
        environmentLabel: null,
      },
    ],
    memberProjectRefs: [{ environmentId, projectId }],
    remoteEnvironmentLabels: [],
  },
];

function ticket(input: Partial<Ticket>): Ticket {
  return {
    id: input.id ?? ("ticket-1" as Ticket["id"]),
    projectId: input.projectId ?? projectId,
    title: input.title ?? "Ticket",
    description: "",
    status: input.status ?? "triage",
    priority: "none",
    labels: [],
    milestoneId: null,
    sourceThreadId: null,
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z",
    archivedAt: null,
  };
}

function milestone(input: Partial<TicketMilestone>): TicketMilestone {
  return {
    id: input.id ?? ("milestone-1" as TicketMilestone["id"]),
    projectId: input.projectId ?? projectId,
    title: input.title ?? "Milestone",
    description: "",
    status: input.status ?? "planned",
    targetDate: null,
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z",
    archivedAt: null,
  };
}

describe("ticket navigation logic", () => {
  it("resolves workspace and project scopes", () => {
    expect(getProjectIdsForTicketScope({ projects, scope: "workspace" })).toBeNull();
    expect(
      getProjectIdsForTicketScope({ projects, scope: "logical:quotecloud" })?.has(projectId),
    ).toBe(true);
  });

  it("filters tickets and counts sidebar buckets", () => {
    const scoped = filterTicketsForScope(
      [
        ticket({ id: "ticket-1" as Ticket["id"], status: "triage" }),
        ticket({ id: "ticket-2" as Ticket["id"], status: "in_progress" }),
        ticket({
          id: "ticket-3" as Ticket["id"],
          projectId: ProjectId.make("other"),
          status: "done",
        }),
      ],
      new Set([projectId]),
    );

    expect(scoped).toHaveLength(2);
    expect(countTriageTickets(scoped)).toBe(1);
    expect(countIssueTickets(scoped)).toBe(2);
  });

  it("filters milestones and counts active ticket projects", () => {
    const scoped = filterMilestonesForScope(
      [
        milestone({ id: "milestone-1" as TicketMilestone["id"], status: "planned" }),
        milestone({ id: "milestone-2" as TicketMilestone["id"], status: "completed" }),
      ],
      new Set([projectId]),
    );

    expect(scoped).toHaveLength(2);
    expect(countActiveMilestones(scoped)).toBe(1);
  });
});
