import { Schema } from "effect";

import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const UsageLimitWindow = Schema.Struct({
  usedPercent: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(100)),
  resetsAt: Schema.NullOr(Schema.Number.check(Schema.isInt())),
  windowDurationMins: Schema.NullOr(Schema.Number.check(Schema.isInt())),
});
export type UsageLimitWindow = typeof UsageLimitWindow.Type;

export const UsageLimitBucket = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  planType: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  primary: Schema.NullOr(UsageLimitWindow),
  secondary: Schema.NullOr(UsageLimitWindow),
});
export type UsageLimitBucket = typeof UsageLimitBucket.Type;

export const CodexUsageSnapshot = Schema.Struct({
  checkedAt: IsoDateTime,
  main: Schema.NullOr(UsageLimitBucket),
  buckets: Schema.Array(UsageLimitBucket),
});
export type CodexUsageSnapshot = typeof CodexUsageSnapshot.Type;

export class ServerUsageError extends Schema.TaggedErrorClass<ServerUsageError>()(
  "ServerUsageError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Server usage error: ${this.detail}`;
  }
}
