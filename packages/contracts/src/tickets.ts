import { Schema } from "effect";

import { IsoDateTime, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

const makeEntityId = <Brand extends string>(brand: Brand) =>
  TrimmedNonEmptyString.pipe(Schema.brand(brand));

export const TicketId = makeEntityId("TicketId");
export type TicketId = typeof TicketId.Type;

export const TicketMilestoneId = makeEntityId("TicketMilestoneId");
export type TicketMilestoneId = typeof TicketMilestoneId.Type;

export const TicketStatus = Schema.Literals([
  "triage",
  "backlog",
  "pending",
  "in_progress",
  "review",
  "done",
  "canceled",
]);
export type TicketStatus = typeof TicketStatus.Type;

export const TicketPriority = Schema.Literals(["none", "low", "medium", "high", "urgent"]);
export type TicketPriority = typeof TicketPriority.Type;

export const TicketMilestoneStatus = Schema.Literals(["planned", "active", "completed", "paused"]);
export type TicketMilestoneStatus = typeof TicketMilestoneStatus.Type;

export const Ticket = Schema.Struct({
  id: TicketId,
  projectId: Schema.NullOr(ProjectId),
  title: TrimmedNonEmptyString,
  description: Schema.String,
  status: TicketStatus,
  priority: TicketPriority,
  labels: Schema.Array(TrimmedNonEmptyString),
  milestoneId: Schema.NullOr(TicketMilestoneId),
  sourceThreadId: Schema.NullOr(ThreadId),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  archivedAt: Schema.NullOr(IsoDateTime),
});
export type Ticket = typeof Ticket.Type;

export const TicketMilestone = Schema.Struct({
  id: TicketMilestoneId,
  projectId: Schema.NullOr(ProjectId),
  title: TrimmedNonEmptyString,
  description: Schema.String,
  status: TicketMilestoneStatus,
  targetDate: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  archivedAt: Schema.NullOr(IsoDateTime),
});
export type TicketMilestone = typeof TicketMilestone.Type;

export const TicketsListInput = Schema.Struct({
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  includeArchived: Schema.optional(Schema.Boolean),
});
export type TicketsListInput = typeof TicketsListInput.Type;

export const TicketsListResult = Schema.Struct({
  tickets: Schema.Array(Ticket),
});
export type TicketsListResult = typeof TicketsListResult.Type;

export const TicketCreateInput = Schema.Struct({
  title: TrimmedNonEmptyString,
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  description: Schema.optional(Schema.String),
  status: Schema.optional(TicketStatus),
  priority: Schema.optional(TicketPriority),
  labels: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  milestoneId: Schema.optional(Schema.NullOr(TicketMilestoneId)),
  sourceThreadId: Schema.optional(Schema.NullOr(ThreadId)),
});
export type TicketCreateInput = typeof TicketCreateInput.Type;

export const TicketCreateResult = Schema.Struct({
  ticket: Ticket,
});
export type TicketCreateResult = typeof TicketCreateResult.Type;

export const TicketUpdateInput = Schema.Struct({
  id: TicketId,
  title: Schema.optional(TrimmedNonEmptyString),
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  description: Schema.optional(Schema.String),
  status: Schema.optional(TicketStatus),
  priority: Schema.optional(TicketPriority),
  labels: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  milestoneId: Schema.optional(Schema.NullOr(TicketMilestoneId)),
  sourceThreadId: Schema.optional(Schema.NullOr(ThreadId)),
});
export type TicketUpdateInput = typeof TicketUpdateInput.Type;

export const TicketUpdateResult = Schema.Struct({
  ticket: Ticket,
});
export type TicketUpdateResult = typeof TicketUpdateResult.Type;

export const TicketArchiveInput = Schema.Struct({
  id: TicketId,
});
export type TicketArchiveInput = typeof TicketArchiveInput.Type;

export const TicketArchiveResult = Schema.Struct({
  ticket: Ticket,
});
export type TicketArchiveResult = typeof TicketArchiveResult.Type;

export class TicketRpcError extends Schema.TaggedErrorClass<TicketRpcError>()("TicketRpcError", {
  message: TrimmedNonEmptyString,
  cause: Schema.optional(Schema.Defect),
}) {}

export const TicketMilestonesListInput = Schema.Struct({
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  includeArchived: Schema.optional(Schema.Boolean),
});
export type TicketMilestonesListInput = typeof TicketMilestonesListInput.Type;

export const TicketMilestonesListResult = Schema.Struct({
  milestones: Schema.Array(TicketMilestone),
});
export type TicketMilestonesListResult = typeof TicketMilestonesListResult.Type;

export const TicketMilestoneCreateInput = Schema.Struct({
  title: TrimmedNonEmptyString,
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  description: Schema.optional(Schema.String),
  status: Schema.optional(TicketMilestoneStatus),
  targetDate: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type TicketMilestoneCreateInput = typeof TicketMilestoneCreateInput.Type;

export const TicketMilestoneCreateResult = Schema.Struct({
  milestone: TicketMilestone,
});
export type TicketMilestoneCreateResult = typeof TicketMilestoneCreateResult.Type;

export const TicketMilestoneUpdateInput = Schema.Struct({
  id: TicketMilestoneId,
  title: Schema.optional(TrimmedNonEmptyString),
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  description: Schema.optional(Schema.String),
  status: Schema.optional(TicketMilestoneStatus),
  targetDate: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type TicketMilestoneUpdateInput = typeof TicketMilestoneUpdateInput.Type;

export const TicketMilestoneUpdateResult = Schema.Struct({
  milestone: TicketMilestone,
});
export type TicketMilestoneUpdateResult = typeof TicketMilestoneUpdateResult.Type;

export const TicketMilestoneArchiveInput = Schema.Struct({
  id: TicketMilestoneId,
});
export type TicketMilestoneArchiveInput = typeof TicketMilestoneArchiveInput.Type;

export const TicketMilestoneArchiveResult = Schema.Struct({
  milestone: TicketMilestone,
});
export type TicketMilestoneArchiveResult = typeof TicketMilestoneArchiveResult.Type;

export class TicketMilestoneRpcError extends Schema.TaggedErrorClass<TicketMilestoneRpcError>()(
  "TicketMilestoneRpcError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}
