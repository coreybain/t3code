import { CommandId } from "@t3tools/contracts";
import { Cause, Duration, Effect, Layer, Schedule } from "effect";

import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  TemporaryThreadReaper,
  type TemporaryThreadReaperShape,
} from "../Services/TemporaryThreadReaper.ts";

const SWEEP_INTERVAL = Duration.minutes(15);

const serverCommandId = (tag: string): CommandId =>
  CommandId.make(`server:${tag}:${crypto.randomUUID()}`);

const make = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;

  const sweepExpiredTemporaryThreads = Effect.fn("sweepExpiredTemporaryThreads")(function* () {
    const now = new Date().toISOString();
    const readModel = yield* orchestrationEngine.getReadModel();
    const expiredThreads = readModel.threads.filter(
      (thread) =>
        thread.kind === "chat" &&
        thread.deletedAt === null &&
        thread.temporaryExpiresAt != null &&
        thread.temporaryExpiresAt <= now,
    );

    for (const thread of expiredThreads) {
      yield* orchestrationEngine
        .dispatch({
          type: "thread.delete",
          commandId: serverCommandId("temporary-thread-reaper-delete"),
          threadId: thread.id,
        })
        .pipe(
          Effect.catchCause((cause) => {
            if (Cause.hasInterruptsOnly(cause)) {
              return Effect.failCause(cause);
            }
            return Effect.logWarning("temporary thread reaper failed to delete expired thread", {
              threadId: thread.id,
              cause: Cause.pretty(cause),
            });
          }),
        );
    }
  });

  const start: TemporaryThreadReaperShape["start"] = Effect.fn("start")(function* () {
    yield* Effect.forkScoped(
      sweepExpiredTemporaryThreads().pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("temporary thread reaper sweep failed", {
            cause: Cause.pretty(cause),
          }),
        ),
        Effect.repeat(Schedule.spaced(SWEEP_INTERVAL)),
      ),
    );
  });

  return {
    start,
  } satisfies TemporaryThreadReaperShape;
});

export const TemporaryThreadReaperLive = Layer.effect(TemporaryThreadReaper, make);
