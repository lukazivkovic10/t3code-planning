import { Schema } from "effect";
import { IsoDateTime, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas";

// ── Branded IDs ────────────────────────────────────────────────────────────

const makeEntityId = <Brand extends string>(brand: Brand) =>
  TrimmedNonEmptyString.pipe(Schema.brand(brand));

export const KanbanTaskId = makeEntityId("KanbanTaskId");
export type KanbanTaskId = typeof KanbanTaskId.Type;

// ── Column ─────────────────────────────────────────────────────────────────

export const KanbanColumnId = Schema.Literals(["waiting", "in_progress", "testing", "complete"]);
export type KanbanColumnId = typeof KanbanColumnId.Type;

// ── Task error (appended on agent failure) ─────────────────────────────────

export const KanbanTaskError = Schema.Struct({
  occurredAt: IsoDateTime,
  column: KanbanColumnId,
  message: Schema.String,
});
export type KanbanTaskError = typeof KanbanTaskError.Type;

// ── Board config (one per project) ────────────────────────────────────────

export const KanbanBoardConfig = Schema.Struct({
  projectId: ProjectId,
  inProgressPrompt: Schema.String,
  testingPrompt: Schema.String,
  updatedAt: IsoDateTime,
});
export type KanbanBoardConfig = typeof KanbanBoardConfig.Type;

// ── Task ───────────────────────────────────────────────────────────────────

export const KanbanTask = Schema.Struct({
  id: KanbanTaskId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  description: Schema.String,
  column: KanbanColumnId,
  sortOrder: Schema.Number,
  linkedThreadId: Schema.NullOr(ThreadId),
  agentFindings: Schema.NullOr(Schema.String),
  errorComments: Schema.Array(KanbanTaskError),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type KanbanTask = typeof KanbanTask.Type;

// ── WS method names ────────────────────────────────────────────────────────

export const KANBAN_WS_METHODS = {
  getBoardConfig: "kanban.board.getConfig",
  updateBoardConfig: "kanban.board.updateConfig",
  listTasks: "kanban.task.list",
  createTask: "kanban.task.create",
  updateTask: "kanban.task.update",
  moveTask: "kanban.task.move",
  stopTask: "kanban.task.stop",
  deleteTask: "kanban.task.delete",
} as const;

export const KANBAN_WS_CHANNELS = {
  domainEvent: "kanban.domainEvent",
} as const;

// ── WS request input schemas ───────────────────────────────────────────────

export const KanbanGetBoardConfigInput = Schema.Struct({
  projectId: ProjectId,
});
export type KanbanGetBoardConfigInput = typeof KanbanGetBoardConfigInput.Type;

export const KanbanUpdateBoardConfigInput = Schema.Struct({
  projectId: ProjectId,
  inProgressPrompt: Schema.optional(Schema.String),
  testingPrompt: Schema.optional(Schema.String),
});
export type KanbanUpdateBoardConfigInput = typeof KanbanUpdateBoardConfigInput.Type;

export const KanbanListTasksInput = Schema.Struct({
  projectId: ProjectId,
});
export type KanbanListTasksInput = typeof KanbanListTasksInput.Type;

export const KanbanCreateTaskInput = Schema.Struct({
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  description: Schema.String,
});
export type KanbanCreateTaskInput = typeof KanbanCreateTaskInput.Type;

export const KanbanUpdateTaskInput = Schema.Struct({
  taskId: KanbanTaskId,
  title: Schema.optional(TrimmedNonEmptyString),
  description: Schema.optional(Schema.String),
});
export type KanbanUpdateTaskInput = typeof KanbanUpdateTaskInput.Type;

export const KanbanMoveTaskInput = Schema.Struct({
  taskId: KanbanTaskId,
  column: KanbanColumnId,
  sortOrder: Schema.Number,
});
export type KanbanMoveTaskInput = typeof KanbanMoveTaskInput.Type;

export const KanbanStopTaskInput = Schema.Struct({
  taskId: KanbanTaskId,
});
export type KanbanStopTaskInput = typeof KanbanStopTaskInput.Type;

export const KanbanDeleteTaskInput = Schema.Struct({
  taskId: KanbanTaskId,
});
export type KanbanDeleteTaskInput = typeof KanbanDeleteTaskInput.Type;

// ── Push event ─────────────────────────────────────────────────────────────

export const KanbanDomainEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("task.created"), task: KanbanTask }),
  Schema.Struct({ type: Schema.Literal("task.updated"), task: KanbanTask }),
  Schema.Struct({ type: Schema.Literal("task.moved"), task: KanbanTask }),
  Schema.Struct({
    type: Schema.Literal("task.deleted"),
    taskId: KanbanTaskId,
    projectId: ProjectId,
  }),
  Schema.Struct({ type: Schema.Literal("task.error"), task: KanbanTask }),
  Schema.Struct({ type: Schema.Literal("config.updated"), config: KanbanBoardConfig }),
]);
export type KanbanDomainEvent = typeof KanbanDomainEvent.Type;

// ── Default prompts ────────────────────────────────────────────────────────

export const KANBAN_DEFAULT_IN_PROGRESS_PROMPT = `You are an expert software engineer. You have been assigned a development task.
Read the task title and description carefully, then implement the feature completely.
Write clean, maintainable code following the project's existing patterns and conventions.
When you are done, summarize what you built.`;

export const KANBAN_DEFAULT_TESTING_PROMPT = `You are a senior QA engineer and test automation expert.
You have been given a completed feature to test.
Write comprehensive tests covering happy paths, edge cases, and error conditions.
Run the tests and fix any failures until all tests pass.
Check for security vulnerabilities and common anti-patterns.
When done, summarize your findings, what tests you wrote, and any issues you found.`;
