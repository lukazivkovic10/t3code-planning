import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE kanban_tasks ADD COLUMN todos TEXT NOT NULL DEFAULT '[]'
  `;

  yield* sql`
    ALTER TABLE kanban_board_configs ADD COLUMN planning_prompt TEXT NOT NULL DEFAULT ''
  `;

  yield* sql`
    ALTER TABLE kanban_board_configs ADD COLUMN require_planning_approval INTEGER NOT NULL DEFAULT 0
  `;
});
