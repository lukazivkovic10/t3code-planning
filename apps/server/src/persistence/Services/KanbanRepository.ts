import {
  IsoDateTime,
  KanbanColumnId,
  KanbanTaskError,
  KanbanTaskId,
  KanbanTodo,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  KanbanThreadStatus,
} from "@t3tools/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect, Option } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const KanbanTaskRow = Schema.Struct({
  id: KanbanTaskId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  description: Schema.String,
  column: KanbanColumnId,
  sortOrder: Schema.Number,
  linkedThreadId: Schema.NullOr(ThreadId),
  agentFindings: Schema.NullOr(Schema.String),
  errorComments: Schema.Array(KanbanTaskError),
  todos: Schema.Array(KanbanTodo),
  color: Schema.NullOr(Schema.String),
  icon: Schema.NullOr(Schema.String),
  tag: Schema.NullOr(Schema.String),
  threadStatus: Schema.NullOr(KanbanThreadStatus),
  branch: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type KanbanTaskRow = typeof KanbanTaskRow.Type;

export const KanbanBoardConfigRow = Schema.Struct({
  projectId: ProjectId,
  inProgressPrompt: Schema.String,
  testingPrompt: Schema.String,
  planningPrompt: Schema.String,
  requirePlanningApproval: Schema.Boolean,
  updatedAt: IsoDateTime,
});
export type KanbanBoardConfigRow = typeof KanbanBoardConfigRow.Type;

export const ListKanbanTasksInput = Schema.Struct({ projectId: ProjectId });
export type ListKanbanTasksInput = typeof ListKanbanTasksInput.Type;

export const GetKanbanTaskInput = Schema.Struct({ taskId: KanbanTaskId });
export type GetKanbanTaskInput = typeof GetKanbanTaskInput.Type;

export const GetKanbanBoardConfigInput = Schema.Struct({ projectId: ProjectId });
export type GetKanbanBoardConfigInput = typeof GetKanbanBoardConfigInput.Type;

export const GetKanbanTaskByThreadInput = Schema.Struct({ linkedThreadId: ThreadId });
export type GetKanbanTaskByThreadInput = typeof GetKanbanTaskByThreadInput.Type;

export const DeleteKanbanTaskInput = Schema.Struct({ taskId: KanbanTaskId });
export type DeleteKanbanTaskInput = typeof DeleteKanbanTaskInput.Type;

export interface KanbanRepositoryShape {
  readonly listTasks: (
    input: ListKanbanTasksInput,
  ) => Effect.Effect<ReadonlyArray<KanbanTaskRow>, ProjectionRepositoryError>;
  readonly getTask: (
    input: GetKanbanTaskInput,
  ) => Effect.Effect<Option.Option<KanbanTaskRow>, ProjectionRepositoryError>;
  readonly getTaskByLinkedThread: (
    input: GetKanbanTaskByThreadInput,
  ) => Effect.Effect<Option.Option<KanbanTaskRow>, ProjectionRepositoryError>;
  readonly upsertTask: (task: KanbanTaskRow) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly deleteTask: (
    input: DeleteKanbanTaskInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getConfig: (
    input: GetKanbanBoardConfigInput,
  ) => Effect.Effect<Option.Option<KanbanBoardConfigRow>, ProjectionRepositoryError>;
  readonly upsertConfig: (
    config: KanbanBoardConfigRow,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class KanbanRepository extends ServiceMap.Service<KanbanRepository, KanbanRepositoryShape>()(
  "t3/persistence/Services/KanbanRepository",
) {}
