import {
  IsoDateTime,
  ProjectId,
  TicketMilestone,
  TicketMilestoneId,
  TicketMilestoneStatus,
} from "@t3tools/contracts";
import { Context, Option, Schema } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const PersistedTicketMilestone = TicketMilestone;
export type PersistedTicketMilestone = typeof PersistedTicketMilestone.Type;

export const ListTicketMilestonesInput = Schema.Struct({
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  includeArchived: Schema.optional(Schema.Boolean),
});
export type ListTicketMilestonesInput = typeof ListTicketMilestonesInput.Type;

export const GetTicketMilestoneInput = Schema.Struct({
  id: TicketMilestoneId,
});
export type GetTicketMilestoneInput = typeof GetTicketMilestoneInput.Type;

export const UpsertTicketMilestoneInput = PersistedTicketMilestone;
export type UpsertTicketMilestoneInput = typeof UpsertTicketMilestoneInput.Type;

export const PatchTicketMilestoneInput = Schema.Struct({
  id: TicketMilestoneId,
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  status: Schema.optional(TicketMilestoneStatus),
  targetDate: Schema.optional(Schema.NullOr(IsoDateTime)),
  updatedAt: IsoDateTime,
});
export type PatchTicketMilestoneInput = typeof PatchTicketMilestoneInput.Type;

export const ArchiveTicketMilestoneInput = Schema.Struct({
  id: TicketMilestoneId,
  archivedAt: IsoDateTime,
});
export type ArchiveTicketMilestoneInput = typeof ArchiveTicketMilestoneInput.Type;

export interface TicketMilestoneRepositoryShape {
  readonly list: (
    input: ListTicketMilestonesInput,
  ) => Effect.Effect<ReadonlyArray<PersistedTicketMilestone>, ProjectionRepositoryError>;
  readonly getById: (
    input: GetTicketMilestoneInput,
  ) => Effect.Effect<Option.Option<PersistedTicketMilestone>, ProjectionRepositoryError>;
  readonly upsert: (
    input: UpsertTicketMilestoneInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly patch: (
    input: PatchTicketMilestoneInput,
  ) => Effect.Effect<Option.Option<PersistedTicketMilestone>, ProjectionRepositoryError>;
  readonly archive: (
    input: ArchiveTicketMilestoneInput,
  ) => Effect.Effect<Option.Option<PersistedTicketMilestone>, ProjectionRepositoryError>;
}

export class TicketMilestoneRepository extends Context.Service<
  TicketMilestoneRepository,
  TicketMilestoneRepositoryShape
>()("t3/persistence/Services/TicketMilestones/TicketMilestoneRepository") {}
