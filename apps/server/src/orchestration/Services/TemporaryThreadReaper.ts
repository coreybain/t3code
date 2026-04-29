import { Context } from "effect";
import type { Effect, Scope } from "effect";

export interface TemporaryThreadReaperShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
}

export class TemporaryThreadReaper extends Context.Service<
  TemporaryThreadReaper,
  TemporaryThreadReaperShape
>()("t3/orchestration/Services/TemporaryThreadReaper") {}
