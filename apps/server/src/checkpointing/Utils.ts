import { Encoding } from "effect";
import { CheckpointRef, type ProjectId, type ThreadId } from "@t3tools/contracts";

export const CHECKPOINT_REFS_PREFIX = "refs/t3/checkpoints";

export function checkpointRefForThreadTurn(threadId: ThreadId, turnCount: number): CheckpointRef {
  return CheckpointRef.make(
    `${CHECKPOINT_REFS_PREFIX}/${Encoding.encodeBase64Url(threadId)}/turn/${turnCount}`,
  );
}

export function resolveThreadWorkspaceCwd(input: {
  readonly thread: {
    readonly kind?: "project" | "chat" | undefined;
    readonly projectId: ProjectId | null;
    readonly worktreePath: string | null;
    readonly workspacePath?: string | null | undefined;
  };
  readonly projects: ReadonlyArray<{
    readonly id: ProjectId;
    readonly workspaceRoot: string;
  }>;
}): string | undefined {
  if (input.thread.kind === "chat") {
    return input.thread.workspacePath ?? undefined;
  }

  const worktreeCwd = input.thread.worktreePath ?? undefined;
  if (worktreeCwd) {
    return worktreeCwd;
  }

  return input.thread.projectId === null
    ? undefined
    : input.projects.find((project) => project.id === input.thread.projectId)?.workspaceRoot;
}
