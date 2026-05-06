import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS tickets (
      ticket_id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      labels_json TEXT NOT NULL,
      milestone_id TEXT,
      source_thread_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS ticket_milestones (
      milestone_id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      target_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_tickets_project_archived_status_updated
    ON tickets(project_id, archived_at, status, updated_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_tickets_status_archived_updated
    ON tickets(status, archived_at, updated_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_tickets_milestone_archived
    ON tickets(milestone_id, archived_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_tickets_source_thread
    ON tickets(source_thread_id)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_ticket_milestones_project_archived_updated
    ON ticket_milestones(project_id, archived_at, updated_at)
  `;
});
