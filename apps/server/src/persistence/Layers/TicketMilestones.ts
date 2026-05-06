import { TicketMilestoneStatus } from "@t3tools/contracts";
import { Effect, Layer, Option, Struct } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  ArchiveTicketMilestoneInput,
  GetTicketMilestoneInput,
  ListTicketMilestonesInput,
  PatchTicketMilestoneInput,
  PersistedTicketMilestone,
  TicketMilestoneRepository,
  type TicketMilestoneRepositoryShape,
  UpsertTicketMilestoneInput,
} from "../Services/TicketMilestones.ts";

const TicketMilestoneDbRow = PersistedTicketMilestone.mapFields(
  Struct.assign({
    status: TicketMilestoneStatus,
  }),
);

const makeTicketMilestoneRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const selectMilestoneById = SqlSchema.findOneOption({
    Request: GetTicketMilestoneInput,
    Result: TicketMilestoneDbRow,
    execute: ({ id }) => sql`
      SELECT
        milestone_id AS "id",
        project_id AS "projectId",
        title,
        description,
        status,
        target_date AS "targetDate",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        archived_at AS "archivedAt"
      FROM ticket_milestones
      WHERE milestone_id = ${id}
    `,
  });

  const listMilestones = SqlSchema.findAll({
    Request: ListTicketMilestonesInput,
    Result: TicketMilestoneDbRow,
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
          milestone_id AS "id",
          project_id AS "projectId",
          title,
          description,
          status,
          target_date AS "targetDate",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          archived_at AS "archivedAt"
        FROM ticket_milestones
        WHERE ${archivedClause} AND ${projectClause}
        ORDER BY updated_at DESC, created_at DESC, milestone_id ASC
      `;
    },
  });

  const upsertMilestone = SqlSchema.void({
    Request: UpsertTicketMilestoneInput,
    execute: (milestone) => sql`
      INSERT INTO ticket_milestones (
        milestone_id,
        project_id,
        title,
        description,
        status,
        target_date,
        created_at,
        updated_at,
        archived_at
      )
      VALUES (
        ${milestone.id},
        ${milestone.projectId},
        ${milestone.title},
        ${milestone.description},
        ${milestone.status},
        ${milestone.targetDate},
        ${milestone.createdAt},
        ${milestone.updatedAt},
        ${milestone.archivedAt}
      )
      ON CONFLICT (milestone_id)
      DO UPDATE SET
        project_id = excluded.project_id,
        title = excluded.title,
        description = excluded.description,
        status = excluded.status,
        target_date = excluded.target_date,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        archived_at = excluded.archived_at
    `,
  });

  const patchMilestone = (input: PatchTicketMilestoneInput) =>
    Effect.gen(function* () {
      const current = yield* selectMilestoneById({ id: input.id });
      if (Option.isNone(current)) {
        return Option.none<PersistedTicketMilestone>();
      }
      const next: PersistedTicketMilestone = {
        ...current.value,
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.targetDate !== undefined ? { targetDate: input.targetDate } : {}),
        updatedAt: input.updatedAt,
      };
      yield* upsertMilestone(next);
      return Option.some(next);
    });

  const archiveMilestone = (input: ArchiveTicketMilestoneInput) =>
    Effect.gen(function* () {
      const current = yield* selectMilestoneById({ id: input.id });
      if (Option.isNone(current)) {
        return Option.none<PersistedTicketMilestone>();
      }
      const next: PersistedTicketMilestone = {
        ...current.value,
        archivedAt: input.archivedAt,
        updatedAt: input.archivedAt,
      };
      yield* upsertMilestone(next);
      return Option.some(next);
    });

  const list: TicketMilestoneRepositoryShape["list"] = (input) =>
    listMilestones(input).pipe(
      Effect.mapError(toPersistenceSqlError("TicketMilestoneRepository.list:query")),
    );
  const getById: TicketMilestoneRepositoryShape["getById"] = (input) =>
    selectMilestoneById(input).pipe(
      Effect.mapError(toPersistenceSqlError("TicketMilestoneRepository.getById:query")),
    );
  const upsert: TicketMilestoneRepositoryShape["upsert"] = (input) =>
    upsertMilestone(input).pipe(
      Effect.mapError(toPersistenceSqlError("TicketMilestoneRepository.upsert:query")),
    );
  const patch: TicketMilestoneRepositoryShape["patch"] = (input) =>
    patchMilestone(input).pipe(
      Effect.mapError(toPersistenceSqlError("TicketMilestoneRepository.patch:query")),
    );
  const archive: TicketMilestoneRepositoryShape["archive"] = (input) =>
    archiveMilestone(input).pipe(
      Effect.mapError(toPersistenceSqlError("TicketMilestoneRepository.archive:query")),
    );

  return { list, getById, upsert, patch, archive } satisfies TicketMilestoneRepositoryShape;
});

export const TicketMilestoneRepositoryLive = Layer.effect(
  TicketMilestoneRepository,
  makeTicketMilestoneRepository,
);
