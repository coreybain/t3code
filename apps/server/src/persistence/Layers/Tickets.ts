import { Effect, Layer, Option, Schema, Struct } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  ArchiveTicketInput,
  GetTicketInput,
  ListTicketsInput,
  PatchTicketInput,
  PersistedTicket,
  TicketRepository,
  type TicketRepositoryShape,
  UpsertTicketInput,
} from "../Services/Tickets.ts";

const TicketDbRow = PersistedTicket.mapFields(
  Struct.assign({
    labels: Schema.fromJsonString(Schema.Array(Schema.String)),
  }),
);

const makeTicketRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const selectTicketById = SqlSchema.findOneOption({
    Request: GetTicketInput,
    Result: TicketDbRow,
    execute: ({ id }) => sql`
      SELECT
        ticket_id AS "id",
        project_id AS "projectId",
        title,
        description,
        status,
        priority,
        labels_json AS "labels",
        milestone_id AS "milestoneId",
        source_thread_id AS "sourceThreadId",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        archived_at AS "archivedAt"
      FROM tickets
      WHERE ticket_id = ${id}
    `,
  });

  const listTickets = SqlSchema.findAll({
    Request: ListTicketsInput,
    Result: TicketDbRow,
    execute: ({ projectId, includeArchived }) => {
      const archivedClause = includeArchived ? sql`1 = 1` : sql`archived_at IS NULL`;
      const projectClause =
        projectId === undefined
          ? sql`1 = 1`
          : projectId === null
            ? sql`project_id IS NULL`
            : sql`project_id = ${projectId}`;
      return sql`
        SELECT
          ticket_id AS "id",
          project_id AS "projectId",
          title,
          description,
          status,
          priority,
          labels_json AS "labels",
          milestone_id AS "milestoneId",
          source_thread_id AS "sourceThreadId",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          archived_at AS "archivedAt"
        FROM tickets
        WHERE ${archivedClause} AND ${projectClause}
        ORDER BY updated_at DESC, created_at DESC, ticket_id ASC
      `;
    },
  });

  const upsertTicket = SqlSchema.void({
    Request: UpsertTicketInput,
    execute: (ticket) => sql`
      INSERT INTO tickets (
        ticket_id,
        project_id,
        title,
        description,
        status,
        priority,
        labels_json,
        milestone_id,
        source_thread_id,
        created_at,
        updated_at,
        archived_at
      )
      VALUES (
        ${ticket.id},
        ${ticket.projectId},
        ${ticket.title},
        ${ticket.description},
        ${ticket.status},
        ${ticket.priority},
        ${JSON.stringify(ticket.labels)},
        ${ticket.milestoneId},
        ${ticket.sourceThreadId},
        ${ticket.createdAt},
        ${ticket.updatedAt},
        ${ticket.archivedAt}
      )
      ON CONFLICT (ticket_id)
      DO UPDATE SET
        project_id = excluded.project_id,
        title = excluded.title,
        description = excluded.description,
        status = excluded.status,
        priority = excluded.priority,
        labels_json = excluded.labels_json,
        milestone_id = excluded.milestone_id,
        source_thread_id = excluded.source_thread_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        archived_at = excluded.archived_at
    `,
  });

  const patchTicket = (input: PatchTicketInput) =>
    Effect.gen(function* () {
      const current = yield* selectTicketById({ id: input.id });
      if (Option.isNone(current)) {
        return Option.none<PersistedTicket>();
      }
      const next: PersistedTicket = {
        ...current.value,
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.labels !== undefined ? { labels: input.labels } : {}),
        ...(input.milestoneId !== undefined ? { milestoneId: input.milestoneId } : {}),
        ...(input.sourceThreadId !== undefined ? { sourceThreadId: input.sourceThreadId } : {}),
        updatedAt: input.updatedAt,
      };
      yield* upsertTicket(next);
      return Option.some(next);
    });

  const archiveTicket = (input: ArchiveTicketInput) =>
    Effect.gen(function* () {
      const current = yield* selectTicketById({ id: input.id });
      if (Option.isNone(current)) {
        return Option.none<PersistedTicket>();
      }
      const next: PersistedTicket = {
        ...current.value,
        archivedAt: input.archivedAt,
        updatedAt: input.archivedAt,
      };
      yield* upsertTicket(next);
      return Option.some(next);
    });

  const list: TicketRepositoryShape["list"] = (input) =>
    listTickets(input).pipe(Effect.mapError(toPersistenceSqlError("TicketRepository.list:query")));
  const getById: TicketRepositoryShape["getById"] = (input) =>
    selectTicketById(input).pipe(
      Effect.mapError(toPersistenceSqlError("TicketRepository.getById:query")),
    );
  const upsert: TicketRepositoryShape["upsert"] = (input) =>
    upsertTicket(input).pipe(
      Effect.mapError(toPersistenceSqlError("TicketRepository.upsert:query")),
    );
  const patch: TicketRepositoryShape["patch"] = (input) =>
    patchTicket(input).pipe(Effect.mapError(toPersistenceSqlError("TicketRepository.patch:query")));
  const archive: TicketRepositoryShape["archive"] = (input) =>
    archiveTicket(input).pipe(
      Effect.mapError(toPersistenceSqlError("TicketRepository.archive:query")),
    );

  return { list, getById, upsert, patch, archive } satisfies TicketRepositoryShape;
});

export const TicketRepositoryLive = Layer.effect(TicketRepository, makeTicketRepository);
