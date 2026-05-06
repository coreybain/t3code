import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { Data, Effect } from "effect";
import { ThreadId } from "@t3tools/contracts";

const SAFE_THREAD_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

export class ChatThreadWorkspaceError extends Data.TaggedError("ChatThreadWorkspaceError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

function safeThreadFolderName(threadId: ThreadId): string {
  const raw = String(threadId);
  return SAFE_THREAD_ID_PATTERN.test(raw)
    ? raw
    : Buffer.from(raw).toString("base64url").slice(0, 96);
}

export function resolveChatThreadWorkspacePath(input: {
  readonly chatThreadsDir: string;
  readonly threadId: ThreadId;
}): string {
  return path.join(input.chatThreadsDir, safeThreadFolderName(input.threadId));
}

export function isPathInsideChatThreadsDir(input: {
  readonly chatThreadsDir: string;
  readonly workspacePath: string;
}): boolean {
  const root = path.resolve(input.chatThreadsDir);
  const target = path.resolve(input.workspacePath);
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function ensureChatThreadWorkspace(input: {
  readonly chatThreadsDir: string;
  readonly threadId: ThreadId;
}) {
  const workspacePath = resolveChatThreadWorkspacePath(input);
  return Effect.tryPromise({
    try: () => mkdir(workspacePath, { recursive: true }),
    catch: (cause) =>
      new ChatThreadWorkspaceError({
        message: "Failed to create chat workspace folder",
        cause,
      }),
  }).pipe(Effect.as(workspacePath));
}

export function removeChatThreadWorkspace(input: {
  readonly chatThreadsDir: string;
  readonly workspacePath: string | null;
}) {
  const workspacePath = input.workspacePath;
  if (
    !workspacePath ||
    !isPathInsideChatThreadsDir({ chatThreadsDir: input.chatThreadsDir, workspacePath })
  ) {
    return Effect.void;
  }
  return Effect.tryPromise({
    try: () => rm(workspacePath, { recursive: true, force: true }),
    catch: (cause) =>
      new ChatThreadWorkspaceError({
        message: "Failed to remove chat workspace folder",
        cause,
      }),
  }).pipe(Effect.ignore);
}
