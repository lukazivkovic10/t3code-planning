import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE kanban_tasks ADD COLUMN color TEXT DEFAULT NULL
  `;

  yield* sql`
    ALTER TABLE kanban_tasks ADD COLUMN icon TEXT DEFAULT NULL
  `;
});
