import { ProjectId, TicketId, TicketMilestoneId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { TicketMilestoneRepositoryLive } from "./TicketMilestones.ts";
import { TicketRepositoryLive } from "./Tickets.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";
import { TicketMilestoneRepository } from "../Services/TicketMilestones.ts";
import { TicketRepository } from "../Services/Tickets.ts";

const TestLayer = it.layer(
  Layer.mergeAll(
    TicketRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    TicketMilestoneRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    SqlitePersistenceMemory,
  ),
);

TestLayer("Ticket repositories", (it) => {
  it.effect("creates, updates, lists, and archives tickets", () =>
    Effect.gen(function* () {
      const tickets = yield* TicketRepository;
      const now = "2026-04-29T00:00:00.000Z";
      const id = TicketId.make("ticket-1");

      yield* tickets.upsert({
        id,
        projectId: ProjectId.make("project-1"),
        title: "First ticket",
        description: "",
        status: "triage",
        priority: "none",
        labels: ["Bug"],
        milestoneId: null,
        sourceThreadId: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      });

      const listed = yield* tickets.list({});
      assert.strictEqual(listed.length, 1);
      assert.deepStrictEqual(listed[0]?.labels, ["Bug"]);

      const updated = yield* tickets.patch({
        id,
        status: "in_progress",
        priority: "high",
        updatedAt: "2026-04-29T00:01:00.000Z",
      });
      assert.strictEqual(Option.getOrThrow(updated).status, "in_progress");
      assert.strictEqual(Option.getOrThrow(updated).priority, "high");

      yield* tickets.archive({
        id,
        archivedAt: "2026-04-29T00:02:00.000Z",
      });
      assert.strictEqual((yield* tickets.list({})).length, 0);
      assert.strictEqual((yield* tickets.list({ includeArchived: true })).length, 1);
    }),
  );

  it.effect("creates, updates, lists, and archives ticket milestones", () =>
    Effect.gen(function* () {
      const milestones = yield* TicketMilestoneRepository;
      const now = "2026-04-29T00:00:00.000Z";
      const id = TicketMilestoneId.make("milestone-1");

      yield* milestones.upsert({
        id,
        projectId: null,
        title: "Launch",
        description: "",
        status: "planned",
        targetDate: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      });

      const listed = yield* milestones.list({});
      assert.strictEqual(listed.length, 1);

      const updated = yield* milestones.patch({
        id,
        status: "active",
        updatedAt: "2026-04-29T00:01:00.000Z",
      });
      assert.strictEqual(Option.getOrThrow(updated).status, "active");

      yield* milestones.archive({
        id,
        archivedAt: "2026-04-29T00:02:00.000Z",
      });
      assert.strictEqual((yield* milestones.list({})).length, 0);
      assert.strictEqual((yield* milestones.list({ includeArchived: true })).length, 1);
    }),
  );
});
