import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS kanban_board_configs (
      project_id TEXT PRIMARY KEY,
      in_progress_prompt TEXT NOT NULL DEFAULT '',
      testing_prompt TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS kanban_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      column_id TEXT NOT NULL DEFAULT 'waiting',
      sort_order REAL NOT NULL DEFAULT 0,
      linked_thread_id TEXT,
      agent_findings TEXT,
      error_comments TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_kanban_tasks_project_column
    ON kanban_tasks(project_id, column_id, sort_order)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_kanban_tasks_linked_thread
    ON kanban_tasks(linked_thread_id)
  `;
});
