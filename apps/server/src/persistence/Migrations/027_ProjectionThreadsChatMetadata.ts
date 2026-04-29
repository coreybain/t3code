import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
    PRAGMA table_info(projection_threads)
  `;
  const hasKind = columns.some((column) => column.name === "kind");
  const projectIdColumn = columns.find((column) => column.name === "project_id");
  const hasCheckpointedFileChanges = columns.some(
    (column) => column.name === "has_checkpointed_file_changes",
  );

  if (!hasCheckpointedFileChanges) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN has_checkpointed_file_changes INTEGER NOT NULL DEFAULT 0
    `;
  }

  if (!hasKind || projectIdColumn?.notnull === 1) {
    yield* sql`DROP TABLE IF EXISTS projection_threads_new`;
    yield* sql`
      CREATE TABLE projection_threads_new (
        thread_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'project',
        project_id TEXT,
        title TEXT NOT NULL,
        model_selection_json TEXT NOT NULL,
        runtime_mode TEXT NOT NULL,
        interaction_mode TEXT NOT NULL,
        branch TEXT,
        worktree_path TEXT,
        workspace_path TEXT,
        latest_turn_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT,
        pinned_at TEXT,
        temporary_expires_at TEXT,
        latest_user_message_at TEXT,
        pending_approval_count INTEGER NOT NULL DEFAULT 0,
        pending_user_input_count INTEGER NOT NULL DEFAULT 0,
        has_actionable_proposed_plan INTEGER NOT NULL DEFAULT 0,
        has_checkpointed_file_changes INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT
      )
    `;

    yield* sql`
      INSERT INTO projection_threads_new (
        thread_id,
        kind,
        project_id,
        title,
        model_selection_json,
        runtime_mode,
        interaction_mode,
        branch,
        worktree_path,
        workspace_path,
        latest_turn_id,
        created_at,
        updated_at,
        archived_at,
        pinned_at,
        temporary_expires_at,
        latest_user_message_at,
        pending_approval_count,
        pending_user_input_count,
        has_actionable_proposed_plan,
        has_checkpointed_file_changes,
        deleted_at
      )
      SELECT
        thread_id,
        'project',
        project_id,
        title,
        model_selection_json,
        runtime_mode,
        interaction_mode,
        branch,
        worktree_path,
        NULL,
        latest_turn_id,
        created_at,
        updated_at,
        archived_at,
        NULL,
        NULL,
        latest_user_message_at,
        pending_approval_count,
        pending_user_input_count,
        has_actionable_proposed_plan,
        has_checkpointed_file_changes,
        deleted_at
      FROM projection_threads
    `;

    yield* sql`DROP TABLE projection_threads`;
    yield* sql`ALTER TABLE projection_threads_new RENAME TO projection_threads`;
  } else {
    if (!columns.some((column) => column.name === "workspace_path")) {
      yield* sql`ALTER TABLE projection_threads ADD COLUMN workspace_path TEXT`;
    }
    if (!columns.some((column) => column.name === "pinned_at")) {
      yield* sql`ALTER TABLE projection_threads ADD COLUMN pinned_at TEXT`;
    }
    if (!columns.some((column) => column.name === "temporary_expires_at")) {
      yield* sql`ALTER TABLE projection_threads ADD COLUMN temporary_expires_at TEXT`;
    }
  }

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_project_id
    ON projection_threads(project_id)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_project_archived_at
    ON projection_threads(project_id, archived_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_project_deleted_created
    ON projection_threads(project_id, deleted_at, created_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_kind_deleted_archived
    ON projection_threads(kind, deleted_at, archived_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_temporary_expires_at
    ON projection_threads(temporary_expires_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_kind_pinned_updated
    ON projection_threads(kind, pinned_at, updated_at)
  `;
});
