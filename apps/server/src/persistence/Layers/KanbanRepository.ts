import { Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  DeleteKanbanTaskInput,
  GetKanbanBoardConfigInput,
  GetKanbanTaskByThreadInput,
  GetKanbanTaskInput,
  KanbanBoardConfigRow,
  KanbanRepository,
  ListKanbanTasksInput,
  type KanbanRepositoryShape,
  type KanbanTaskRow,
} from "../Services/KanbanRepository.ts";
import {
  IsoDateTime,
  KanbanColumnId,
  KanbanTaskError,
  KanbanTaskId,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";

// Raw schema used when reading tasks from the DB.
// errorComments is a JSON text column; we decode it manually after retrieval.
const KanbanTaskRawRow = Schema.Struct({
  id: KanbanTaskId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  description: Schema.String,
  column: KanbanColumnId,
  sortOrder: Schema.Number,
  linkedThreadId: Schema.NullOr(ThreadId),
  agentFindings: Schema.NullOr(Schema.String),
  errorComments: Schema.String,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
type KanbanTaskRawRow = typeof KanbanTaskRawRow.Type;

const decodeErrorComments = Schema.decodeUnknownSync(Schema.Array(KanbanTaskError));

function rawToKanbanTaskRow(raw: KanbanTaskRawRow): KanbanTaskRow {
  let errorComments: ReadonlyArray<KanbanTaskError>;
  try {
    errorComments = decodeErrorComments(JSON.parse(raw.errorComments));
  } catch {
    errorComments = [];
  }
  return {
    id: raw.id,
    projectId: raw.projectId,
    title: raw.title,
    description: raw.description,
    column: raw.column,
    sortOrder: raw.sortOrder,
    linkedThreadId: raw.linkedThreadId,
    agentFindings: raw.agentFindings,
    errorComments,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

const makeKanbanRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // ── Tasks ────────────────────────────────────────────────────────────────

  const listKanbanTaskRawRows = SqlSchema.findAll({
    Request: ListKanbanTasksInput,
    Result: KanbanTaskRawRow,
    execute: ({ projectId }) => sql`
      SELECT
        id,
        project_id AS "projectId",
        title,
        description,
        column_id AS "column",
        sort_order AS "sortOrder",
        linked_thread_id AS "linkedThreadId",
        agent_findings AS "agentFindings",
        error_comments AS "errorComments",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM kanban_tasks
      WHERE project_id = ${projectId}
      ORDER BY sort_order ASC, id ASC
    `,
  });

  const getKanbanTaskRawRow = SqlSchema.findOneOption({
    Request: GetKanbanTaskInput,
    Result: KanbanTaskRawRow,
    execute: ({ taskId }) => sql`
      SELECT
        id,
        project_id AS "projectId",
        title,
        description,
        column_id AS "column",
        sort_order AS "sortOrder",
        linked_thread_id AS "linkedThreadId",
        agent_findings AS "agentFindings",
        error_comments AS "errorComments",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM kanban_tasks
      WHERE id = ${taskId}
    `,
  });

  const getKanbanTaskByThreadRawRow = SqlSchema.findOneOption({
    Request: GetKanbanTaskByThreadInput,
    Result: KanbanTaskRawRow,
    execute: ({ linkedThreadId }) => sql`
      SELECT
        id,
        project_id AS "projectId",
        title,
        description,
        column_id AS "column",
        sort_order AS "sortOrder",
        linked_thread_id AS "linkedThreadId",
        agent_findings AS "agentFindings",
        error_comments AS "errorComments",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM kanban_tasks
      WHERE linked_thread_id = ${linkedThreadId}
    `,
  });

  const upsertKanbanTaskRow = SqlSchema.void({
    Request: KanbanTaskRawRow,
    execute: (row) => sql`
      INSERT INTO kanban_tasks (
        id,
        project_id,
        title,
        description,
        column_id,
        sort_order,
        linked_thread_id,
        agent_findings,
        error_comments,
        created_at,
        updated_at
      )
      VALUES (
        ${row.id},
        ${row.projectId},
        ${row.title},
        ${row.description},
        ${row.column},
        ${row.sortOrder},
        ${row.linkedThreadId},
        ${row.agentFindings},
        ${row.errorComments},
        ${row.createdAt},
        ${row.updatedAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        project_id = excluded.project_id,
        title = excluded.title,
        description = excluded.description,
        column_id = excluded.column_id,
        sort_order = excluded.sort_order,
        linked_thread_id = excluded.linked_thread_id,
        agent_findings = excluded.agent_findings,
        error_comments = excluded.error_comments,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `,
  });

  const deleteKanbanTaskRow = SqlSchema.void({
    Request: DeleteKanbanTaskInput,
    execute: ({ taskId }) => sql`
      DELETE FROM kanban_tasks
      WHERE id = ${taskId}
    `,
  });

  // ── Board config ─────────────────────────────────────────────────────────

  const getKanbanBoardConfigRow = SqlSchema.findOneOption({
    Request: GetKanbanBoardConfigInput,
    Result: KanbanBoardConfigRow,
    execute: ({ projectId }) => sql`
      SELECT
        project_id AS "projectId",
        in_progress_prompt AS "inProgressPrompt",
        testing_prompt AS "testingPrompt",
        updated_at AS "updatedAt"
      FROM kanban_board_configs
      WHERE project_id = ${projectId}
    `,
  });

  const upsertKanbanBoardConfigRow = SqlSchema.void({
    Request: KanbanBoardConfigRow,
    execute: (row) => sql`
      INSERT INTO kanban_board_configs (
        project_id,
        in_progress_prompt,
        testing_prompt,
        updated_at
      )
      VALUES (
        ${row.projectId},
        ${row.inProgressPrompt},
        ${row.testingPrompt},
        ${row.updatedAt}
      )
      ON CONFLICT (project_id) DO UPDATE SET
        in_progress_prompt = excluded.in_progress_prompt,
        testing_prompt = excluded.testing_prompt,
        updated_at = excluded.updated_at
    `,
  });

  // ── Shape impl ───────────────────────────────────────────────────────────

  const listTasks: KanbanRepositoryShape["listTasks"] = (input) =>
    listKanbanTaskRawRows(input).pipe(
      Effect.mapError(toPersistenceSqlError("KanbanRepository.listTasks:query")),
      Effect.map((rows) => rows.map(rawToKanbanTaskRow)),
    );

  const getTask: KanbanRepositoryShape["getTask"] = (input) =>
    getKanbanTaskRawRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("KanbanRepository.getTask:query")),
      Effect.map((option) => Option.map(option, rawToKanbanTaskRow)),
    );

  const getTaskByLinkedThread: KanbanRepositoryShape["getTaskByLinkedThread"] = (input) =>
    getKanbanTaskByThreadRawRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("KanbanRepository.getTaskByLinkedThread:query")),
      Effect.map((option) => Option.map(option, rawToKanbanTaskRow)),
    );

  const upsertTask: KanbanRepositoryShape["upsertTask"] = (task) => {
    const raw: KanbanTaskRawRow = {
      ...task,
      errorComments: JSON.stringify(task.errorComments),
    };
    return upsertKanbanTaskRow(raw).pipe(
      Effect.mapError(toPersistenceSqlError("KanbanRepository.upsertTask:query")),
    );
  };

  const deleteTask: KanbanRepositoryShape["deleteTask"] = (input) =>
    deleteKanbanTaskRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("KanbanRepository.deleteTask:query")),
    );

  const getConfig: KanbanRepositoryShape["getConfig"] = (input) =>
    getKanbanBoardConfigRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("KanbanRepository.getConfig:query")),
    );

  const upsertConfig: KanbanRepositoryShape["upsertConfig"] = (config) =>
    upsertKanbanBoardConfigRow(config).pipe(
      Effect.mapError(toPersistenceSqlError("KanbanRepository.upsertConfig:query")),
    );

  return {
    listTasks,
    getTask,
    getTaskByLinkedThread,
    upsertTask,
    deleteTask,
    getConfig,
    upsertConfig,
  } satisfies KanbanRepositoryShape;
});

export const KanbanRepositoryLive = Layer.effect(KanbanRepository, makeKanbanRepository);
