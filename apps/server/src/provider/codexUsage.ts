import { DateTime, Duration, Effect, Layer, Option, Result, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import * as CodexClient from "effect-codex-app-server/client";
import * as CodexErrors from "effect-codex-app-server/errors";
import * as CodexSchema from "effect-codex-app-server/schema";
import {
  type CodexUsageSnapshot,
  ServerUsageError,
  type UsageLimitBucket,
} from "@t3tools/contracts";

import { ServerConfig } from "../config.ts";
import { expandHomePath } from "../pathExpansion.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { buildCodexInitializeParams } from "./Layers/CodexProvider.ts";

const CODEX_USAGE_TIMEOUT_MS = 5_000;

type CodexRateLimitSnapshot =
  | CodexSchema.V2GetAccountRateLimitsResponse["rateLimits"]
  | CodexSchema.V2GetAccountRateLimitsResponse__RateLimitSnapshot;

function normalizeWindow(
  window: CodexSchema.V2GetAccountRateLimitsResponse__RateLimitWindow | null | undefined,
) {
  if (!window) return null;
  return {
    usedPercent: window.usedPercent,
    resetsAt: window.resetsAt ?? null,
    windowDurationMins: window.windowDurationMins ?? null,
  };
}

function normalizeBucket(
  snapshot: CodexRateLimitSnapshot,
  fallbackId: string,
  fallbackName: string,
): UsageLimitBucket {
  const id = snapshot.limitId?.trim() || fallbackId;
  const name = snapshot.limitName?.trim() || snapshot.limitId?.trim() || fallbackName;
  return {
    id,
    name,
    ...(snapshot.planType ? { planType: snapshot.planType } : {}),
    primary: normalizeWindow(snapshot.primary),
    secondary: normalizeWindow(snapshot.secondary),
  };
}

export function normalizeCodexUsageSnapshot(
  response: CodexSchema.V2GetAccountRateLimitsResponse,
  checkedAt: string,
): CodexUsageSnapshot {
  const main = normalizeBucket(response.rateLimits, "main", "General usage limits");
  const keyedBuckets = response.rateLimitsByLimitId
    ? Object.entries(response.rateLimitsByLimitId).map(([limitId, snapshot]) =>
        normalizeBucket(snapshot, limitId, limitId),
      )
    : [];

  return {
    checkedAt,
    main,
    buckets: keyedBuckets.length > 0 ? keyedBuckets : [main],
  };
}

function describeCodexUsageError(error: CodexErrors.CodexAppServerError): string {
  if (Schema.is(CodexErrors.CodexAppServerSpawnError)(error)) {
    return "Codex CLI (`codex`) is not installed or not on PATH.";
  }
  return `Failed to read Codex usage: ${error.message}`;
}

export const readCodexUsage = Effect.fn("readCodexUsage")(function* (): Effect.fn.Return<
  CodexUsageSnapshot,
  ServerUsageError,
  ServerConfig | ServerSettingsService | ChildProcessSpawner.ChildProcessSpawner
> {
  const config = yield* ServerConfig;
  const serverSettings = yield* ServerSettingsService;
  const settings = yield* serverSettings.getSettings.pipe(
    Effect.mapError(
      (error) =>
        new ServerUsageError({
          detail: `Failed to read settings for Codex usage: ${error.detail}`,
          cause: error,
        }),
    ),
  );
  const codexSettings = settings.providers.codex;

  if (!codexSettings.enabled) {
    return yield* new ServerUsageError({ detail: "Codex is disabled in T3 Code settings." });
  }

  const readUsage = Effect.gen(function* () {
    const clientContext = yield* Layer.build(
      CodexClient.layerCommand({
        command: codexSettings.binaryPath,
        args: ["app-server"],
        cwd: config.cwd,
        ...(codexSettings.homePath
          ? { env: { CODEX_HOME: expandHomePath(codexSettings.homePath) } }
          : {}),
      }),
    );
    const client = yield* Effect.service(CodexClient.CodexAppServerClient).pipe(
      Effect.provide(clientContext),
    );

    yield* client.request("initialize", buildCodexInitializeParams());
    yield* client.notify("initialized", undefined);

    const accountResponse = yield* client.request("account/read", {});
    if (!accountResponse.account && accountResponse.requiresOpenaiAuth) {
      return yield* new ServerUsageError({
        detail: "Codex CLI is not authenticated. Run `codex login` and try again.",
      });
    }

    const response = yield* client.request("account/rateLimits/read", undefined);
    const checkedAt = DateTime.formatIso(yield* DateTime.now);
    return normalizeCodexUsageSnapshot(response, checkedAt);
  }).pipe(
    Effect.scoped,
    Effect.mapError((error) =>
      Schema.is(ServerUsageError)(error)
        ? error
        : new ServerUsageError({
            detail: describeCodexUsageError(error),
            cause: error,
          }),
    ),
    Effect.timeoutOption(Duration.millis(CODEX_USAGE_TIMEOUT_MS)),
    Effect.result,
  );

  const result = yield* readUsage;
  if (Result.isFailure(result)) {
    return yield* Effect.fail(result.failure);
  }
  if (Option.isNone(result.success)) {
    return yield* new ServerUsageError({ detail: "Timed out while reading Codex usage." });
  }
  return result.success.value;
});
