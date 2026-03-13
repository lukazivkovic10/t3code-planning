/**
 * KanbanService - Service interface for Kanban board business logic.
 *
 * Owns task lifecycle operations including creation, updates, column moves,
 * agent stop, and board configuration management.
 *
 * @module KanbanService
 */
import type {
  KanbanBoardConfig,
  KanbanDeleteTaskInput,
  KanbanGetBoardConfigInput,
  KanbanListTasksInput,
  KanbanCreateTaskInput,
  KanbanMoveTaskInput,
  KanbanStopTaskInput,
  KanbanTask,
  KanbanTaskId,
  KanbanUpdateBoardConfigInput,
  KanbanUpdateTaskInput,
  ProjectId,
} from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

/**
 * KanbanServiceShape - Service API for Kanban board operations.
 */
export interface KanbanServiceShape {
  readonly getBoardConfig: (input: KanbanGetBoardConfigInput) => Effect.Effect<KanbanBoardConfig>;
  readonly updateBoardConfig: (
    input: KanbanUpdateBoardConfigInput,
  ) => Effect.Effect<KanbanBoardConfig>;
  readonly listTasks: (input: KanbanListTasksInput) => Effect.Effect<ReadonlyArray<KanbanTask>>;
  readonly createTask: (input: KanbanCreateTaskInput) => Effect.Effect<KanbanTask>;
  readonly updateTask: (input: KanbanUpdateTaskInput) => Effect.Effect<KanbanTask>;
  readonly moveTask: (input: KanbanMoveTaskInput) => Effect.Effect<KanbanTask>;
  readonly stopTask: (input: KanbanStopTaskInput) => Effect.Effect<KanbanTask>;
  readonly deleteTask: (
    input: KanbanDeleteTaskInput,
  ) => Effect.Effect<{ taskId: KanbanTaskId; projectId: ProjectId }>;
}

/**
 * KanbanService - Service tag for Kanban board business logic.
 */
export class KanbanService extends ServiceMap.Service<KanbanService, KanbanServiceShape>()(
  "t3/kanban/Services/KanbanService",
) {}
