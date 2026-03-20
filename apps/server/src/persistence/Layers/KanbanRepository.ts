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
  KanbanTodo,
  KanbanThreadStatus,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";

// Raw schema used when reading tasks from the DB.
// errorComments and todos are JSON text columns; we decode them manually after retrieval.
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
  todos: Schema.String,
  color: Schema.NullOr(Schema.String),
  icon: Schema.NullOr(Schema.String),
  tag: Schema.NullOr(Schema.String),
  threadStatus: Schema.NullOr(KanbanThreadStatus),
  branch: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
type KanbanTaskRawRow = typeof KanbanTaskRawRow.Type;

const decodeErrorComments = Schema.decodeUnknownSync(Schema.Array(KanbanTaskError));
const decodeTodos = Schema.decodeUnknownSync(Schema.Array(KanbanTodo));

function rawToKanbanTaskRow(raw: KanbanTaskRawRow): KanbanTaskRow {
  let errorComments: ReadonlyArray<KanbanTaskError>;
  try {
    errorComments = decodeErrorComments(JSON.parse(raw.errorComments));
  } catch {
    errorComments = [];
  }
  let todos: ReadonlyArray<KanbanTodo>;
  try {
    todos = decodeTodos(JSON.parse(raw.todos));
  } catch {
    todos = [];
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
    todos,
    color: raw.color,
    icon: raw.icon,
    tag: raw.tag,
    threadStatus: raw.threadStatus,
    branch: raw.branch,
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
        todos,
        color,
        icon,
        tag,
        thread_status AS "threadStatus",
        branch,
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
        todos,
        color,
        icon,
        tag,
        thread_status AS "threadStatus",
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
        todos,
        color,
        icon,
        tag,
        thread_status AS "threadStatus",
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
        todos,
        color,
        icon,
        tag,
        thread_status,
        branch,
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
        ${row.todos},
        ${row.color},
        ${row.icon},
        ${row.tag},
        ${row.threadStatus},
        ${row.branch},
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
        todos = excluded.todos,
        color = excluded.color,
        icon = excluded.icon,
        tag = excluded.tag,
        thread_status = excluded.thread_status,
        branch = excluded.branch,
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

  // Raw row for reading: requirePlanningApproval comes back as a number from SQLite
  const KanbanBoardConfigRawRow = Schema.Struct({
    projectId: ProjectId,
    inProgressPrompt: Schema.String,
    testingPrompt: Schema.String,
    planningPrompt: Schema.String,
    requirePlanningApproval: Schema.Number,
    updatedAt: IsoDateTime,
  });

  const getKanbanBoardConfigRawRow = SqlSchema.findOneOption({
    Request: GetKanbanBoardConfigInput,
    Result: KanbanBoardConfigRawRow,
    execute: ({ projectId }) => sql`
      SELECT
        project_id AS "projectId",
        in_progress_prompt AS "inProgressPrompt",
        testing_prompt AS "testingPrompt",
        planning_prompt AS "planningPrompt",
        require_planning_approval AS "requirePlanningApproval",
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
        planning_prompt,
        require_planning_approval,
        updated_at
      )
      VALUES (
        ${row.projectId},
        ${row.inProgressPrompt},
        ${row.testingPrompt},
        ${row.planningPrompt},
        ${row.requirePlanningApproval ? 1 : 0},
        ${row.updatedAt}
      )
      ON CONFLICT (project_id) DO UPDATE SET
        in_progress_prompt = excluded.in_progress_prompt,
        testing_prompt = excluded.testing_prompt,
        planning_prompt = excluded.planning_prompt,
        require_planning_approval = excluded.require_planning_approval,
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
      todos: JSON.stringify(task.todos),
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
    getKanbanBoardConfigRawRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("KanbanRepository.getConfig:query")),
      Effect.map((option) =>
        Option.map(option, (raw) => ({
          ...raw,
          requirePlanningApproval: raw.requirePlanningApproval !== 0,
        })),
      ),
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
