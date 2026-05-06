import {
  IsoDateTime,
  ProjectId,
  ThreadId,
  Ticket,
  TicketId,
  TicketMilestoneId,
  TicketPriority,
  TicketStatus,
} from "@t3tools/contracts";
import { Context, Option, Schema } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const PersistedTicket = Ticket;
export type PersistedTicket = typeof PersistedTicket.Type;

export const ListTicketsInput = Schema.Struct({
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  includeArchived: Schema.optional(Schema.Boolean),
});
export type ListTicketsInput = typeof ListTicketsInput.Type;

export const GetTicketInput = Schema.Struct({
  id: TicketId,
});
export type GetTicketInput = typeof GetTicketInput.Type;

export const UpsertTicketInput = PersistedTicket;
export type UpsertTicketInput = typeof UpsertTicketInput.Type;

export const PatchTicketInput = Schema.Struct({
  id: TicketId,
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  status: Schema.optional(TicketStatus),
  priority: Schema.optional(TicketPriority),
  labels: Schema.optional(Schema.Array(Schema.String)),
  milestoneId: Schema.optional(Schema.NullOr(TicketMilestoneId)),
  sourceThreadId: Schema.optional(Schema.NullOr(ThreadId)),
  updatedAt: IsoDateTime,
});
export type PatchTicketInput = typeof PatchTicketInput.Type;

export const ArchiveTicketInput = Schema.Struct({
  id: TicketId,
  archivedAt: IsoDateTime,
});
export type ArchiveTicketInput = typeof ArchiveTicketInput.Type;

export interface TicketRepositoryShape {
  readonly list: (
    input: ListTicketsInput,
  ) => Effect.Effect<ReadonlyArray<PersistedTicket>, ProjectionRepositoryError>;
  readonly getById: (
    input: GetTicketInput,
  ) => Effect.Effect<Option.Option<PersistedTicket>, ProjectionRepositoryError>;
  readonly upsert: (input: UpsertTicketInput) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly patch: (
    input: PatchTicketInput,
  ) => Effect.Effect<Option.Option<PersistedTicket>, ProjectionRepositoryError>;
  readonly archive: (
    input: ArchiveTicketInput,
  ) => Effect.Effect<Option.Option<PersistedTicket>, ProjectionRepositoryError>;
}

export class TicketRepository extends Context.Service<TicketRepository, TicketRepositoryShape>()(
  "t3/persistence/Services/Tickets/TicketRepository",
) {}
