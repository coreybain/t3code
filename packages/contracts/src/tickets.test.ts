import { assert, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  ProjectId,
  ThreadId,
  TicketCreateInput,
  TicketUpdateInput,
  TicketMilestoneCreateInput,
} from "./index.ts";

it.effect("decodes ticket create input with nullable project and source refs", () =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(TicketCreateInput)({
      title: " Fix the board ",
      projectId: null,
      sourceThreadId: ThreadId.make("thread-1"),
      labels: ["Bug"],
    });

    assert.strictEqual(decoded.title, "Fix the board");
    assert.strictEqual(decoded.projectId, null);
    assert.strictEqual(decoded.sourceThreadId, ThreadId.make("thread-1"));
    assert.deepStrictEqual(decoded.labels, ["Bug"]);
  }),
);

it.effect("rejects invalid ticket status and priority values", () =>
  Effect.gen(function* () {
    const invalidStatus = yield* Effect.exit(
      Schema.decodeUnknownEffect(TicketUpdateInput)({
        id: "ticket-1",
        status: "blocked",
      }),
    );
    const invalidPriority = yield* Effect.exit(
      Schema.decodeUnknownEffect(TicketCreateInput)({
        title: "Ticket",
        priority: "critical",
      }),
    );

    assert.strictEqual(invalidStatus._tag, "Failure");
    assert.strictEqual(invalidPriority._tag, "Failure");
  }),
);

it.effect("decodes ticket milestone create input", () =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(TicketMilestoneCreateInput)({
      title: "Beta launch",
      projectId: ProjectId.make("project-1"),
      status: "active",
      targetDate: null,
    });

    assert.strictEqual(decoded.title, "Beta launch");
    assert.strictEqual(decoded.projectId, ProjectId.make("project-1"));
    assert.strictEqual(decoded.status, "active");
    assert.strictEqual(decoded.targetDate, null);
  }),
);
