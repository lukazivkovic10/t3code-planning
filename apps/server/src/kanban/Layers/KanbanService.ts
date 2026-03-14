import {
  CommandId,
  IsoDateTime,
  KANBAN_DEFAULT_IN_PROGRESS_PROMPT,
  KANBAN_DEFAULT_PLANNING_PROMPT,
  KANBAN_DEFAULT_TESTING_PROMPT,
  KanbanBoardConfig,
  KanbanTask,
  KanbanTaskId,
  MessageId,
  type OrchestrationProject,
  ThreadId,
} from "@t3tools/contracts";
import { Effect, Layer, Option } from "effect";

import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import {
  KanbanRepository,
  type KanbanBoardConfigRow,
  type KanbanTaskRow,
} from "../../persistence/Services/KanbanRepository.ts";
import { KanbanService, type KanbanServiceShape } from "../Services/KanbanService.ts";

const serverCommandId = (tag: string): CommandId =>
  CommandId.makeUnsafe(`server:${tag}:${crypto.randomUUID()}`);

function taskRowToTask(row: KanbanTaskRow): KanbanTask {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    column: row.column,
    sortOrder: row.sortOrder,
    linkedThreadId: row.linkedThreadId,
    agentFindings: row.agentFindings,
    errorComments: row.errorComments,
    todos: row.todos,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function configRowToConfig(row: KanbanBoardConfigRow): KanbanBoardConfig {
  return {
    projectId: row.projectId,
    inProgressPrompt: row.inProgressPrompt,
    testingPrompt: row.testingPrompt,
    planningPrompt: row.planningPrompt,
    requirePlanningApproval: row.requirePlanningApproval,
    updatedAt: row.updatedAt,
  };
}

const makeKanbanService = Effect.gen(function* () {
  const repository = yield* KanbanRepository;
  const orchestrationEngine = yield* OrchestrationEngineService;

  const getBoardConfig: KanbanServiceShape["getBoardConfig"] = (input) =>
    Effect.gen(function* () {
      const configOption = yield* repository.getConfig({ projectId: input.projectId });
      if (Option.isSome(configOption)) {
        return configRowToConfig(configOption.value);
      }
      const now = new Date().toISOString() as IsoDateTime;
      return {
        projectId: input.projectId,
        inProgressPrompt: KANBAN_DEFAULT_IN_PROGRESS_PROMPT,
        testingPrompt: KANBAN_DEFAULT_TESTING_PROMPT,
        planningPrompt: KANBAN_DEFAULT_PLANNING_PROMPT,
        requirePlanningApproval: false,
        updatedAt: now,
      } satisfies KanbanBoardConfig;
    }).pipe(Effect.orDie);

  const updateBoardConfig: KanbanServiceShape["updateBoardConfig"] = (input) =>
    Effect.gen(function* () {
      const existing = yield* getBoardConfig({ projectId: input.projectId });
      const now = new Date().toISOString() as IsoDateTime;
      const updated: KanbanBoardConfigRow = {
        projectId: input.projectId,
        inProgressPrompt: input.inProgressPrompt ?? existing.inProgressPrompt,
        testingPrompt: input.testingPrompt ?? existing.testingPrompt,
        planningPrompt: input.planningPrompt ?? existing.planningPrompt,
        requirePlanningApproval: input.requirePlanningApproval ?? existing.requirePlanningApproval,
        updatedAt: now,
      };
      yield* repository.upsertConfig(updated);
      return configRowToConfig(updated);
    }).pipe(Effect.orDie);

  const listTasks: KanbanServiceShape["listTasks"] = (input) =>
    repository.listTasks({ projectId: input.projectId }).pipe(
      Effect.map((rows) => rows.map(taskRowToTask)),
      Effect.orDie,
    );

  const createTask: KanbanServiceShape["createTask"] = (input) =>
    Effect.gen(function* () {
      const now = new Date().toISOString() as IsoDateTime;
      const existingTasks = yield* repository.listTasks({ projectId: input.projectId });
      const waitingCount = existingTasks.filter((t) => t.column === "waiting").length;
      const newRow: KanbanTaskRow = {
        id: KanbanTaskId.makeUnsafe(crypto.randomUUID()),
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        column: "waiting",
        sortOrder: waitingCount + 1,
        linkedThreadId: null,
        agentFindings: null,
        errorComments: [],
        todos: [],
        createdAt: now,
        updatedAt: now,
      };
      yield* repository.upsertTask(newRow);
      return taskRowToTask(newRow);
    }).pipe(Effect.orDie);

  const updateTask: KanbanServiceShape["updateTask"] = (input) =>
    Effect.gen(function* () {
      const taskOption = yield* repository.getTask({ taskId: input.taskId });
      if (Option.isNone(taskOption)) {
        return yield* Effect.die(new Error(`KanbanTask not found: ${input.taskId}`));
      }
      const existing = taskOption.value;
      const now = new Date().toISOString() as IsoDateTime;
      const updated: KanbanTaskRow = {
        ...existing,
        title: input.title ?? existing.title,
        description: input.description ?? existing.description,
        updatedAt: now,
      };
      yield* repository.upsertTask(updated);
      return taskRowToTask(updated);
    }).pipe(Effect.orDie);

  const moveTask: KanbanServiceShape["moveTask"] = (input) =>
    Effect.gen(function* () {
      const taskOption = yield* repository.getTask({ taskId: input.taskId });
      if (Option.isNone(taskOption)) {
        return yield* Effect.die(new Error(`KanbanTask not found: ${input.taskId}`));
      }
      const existing = taskOption.value;
      const now = new Date().toISOString() as IsoDateTime;

      let linkedThreadId = existing.linkedThreadId;

      if (input.column === "planning") {
        const readModel = yield* orchestrationEngine.getReadModel();
        const project = readModel.projects.find(
          (p: OrchestrationProject) => p.id === existing.projectId,
        );
        const model = project?.defaultModel ?? "codex";

        const configOption = yield* repository.getConfig({ projectId: existing.projectId });
        const planningPrompt = Option.isSome(configOption)
          ? configOption.value.planningPrompt
          : KANBAN_DEFAULT_PLANNING_PROMPT;

        const newThreadId = ThreadId.makeUnsafe(crypto.randomUUID());
        const threadCreatedAt = new Date().toISOString();

        yield* orchestrationEngine.dispatch({
          type: "thread.create",
          commandId: serverCommandId("kanban-planning-thread-create"),
          threadId: newThreadId,
          projectId: existing.projectId,
          title: `Planning: ${existing.title}`,
          model,
          interactionMode: "default",
          runtimeMode: "full-access",
          branch: null,
          worktreePath: null,
          createdAt: threadCreatedAt,
        });

        yield* orchestrationEngine.dispatch({
          type: "thread.turn.start",
          commandId: serverCommandId("kanban-planning-turn-start"),
          threadId: newThreadId,
          interactionMode: "default",
          message: {
            messageId: MessageId.makeUnsafe(crypto.randomUUID()),
            role: "user",
            text: `${planningPrompt}\n\nTask: ${existing.title}\n\n${existing.description}`,
            attachments: [],
          },
          runtimeMode: "full-access",
          createdAt: new Date().toISOString(),
        });

        linkedThreadId = newThreadId;
      }

      if (input.column === "in_progress") {
        const readModel = yield* orchestrationEngine.getReadModel();
        const project = readModel.projects.find(
          (p: OrchestrationProject) => p.id === existing.projectId,
        );
        const model = project?.defaultModel ?? "codex";

        const configOption = yield* repository.getConfig({ projectId: existing.projectId });
        const config = Option.isSome(configOption) ? configOption.value : null;
        const inProgressPrompt = config?.inProgressPrompt ?? KANBAN_DEFAULT_IN_PROGRESS_PROMPT;
        const requirePlanningApproval = config?.requirePlanningApproval ?? false;

        // Build scope-of-work section from todos if planning approval is on
        let todosContext = "";
        if (requirePlanningApproval && existing.todos.length > 0) {
          const acceptedTodos = existing.todos.filter((t) => t.accepted);
          if (acceptedTodos.length > 0) {
            todosContext =
              "\n\nScope of work (accepted planning steps):\n" +
              acceptedTodos.map((t) => `- ${t.text}`).join("\n");
          }
        } else if (!requirePlanningApproval && existing.todos.length > 0) {
          todosContext =
            "\n\nPlanning steps:\n" + existing.todos.map((t) => `- ${t.text}`).join("\n");
        }

        const newThreadId = ThreadId.makeUnsafe(crypto.randomUUID());
        const threadCreatedAt = new Date().toISOString();

        yield* orchestrationEngine.dispatch({
          type: "thread.create",
          commandId: serverCommandId("kanban-in-progress-thread-create"),
          threadId: newThreadId,
          projectId: existing.projectId,
          title: `In Progress: ${existing.title}`,
          model,
          interactionMode: "default",
          runtimeMode: "full-access",
          branch: null,
          worktreePath: null,
          createdAt: threadCreatedAt,
        });

        yield* orchestrationEngine.dispatch({
          type: "thread.turn.start",
          commandId: serverCommandId("kanban-in-progress-turn-start"),
          threadId: newThreadId,
          interactionMode: "default",
          message: {
            messageId: MessageId.makeUnsafe(crypto.randomUUID()),
            role: "user",
            text: `${inProgressPrompt}\n\nTask: ${existing.title}\n\n${existing.description}${todosContext}`,
            attachments: [],
          },
          runtimeMode: "full-access",
          createdAt: new Date().toISOString(),
        });

        linkedThreadId = newThreadId;
      }

      const updated: KanbanTaskRow = {
        ...existing,
        column: input.column,
        sortOrder: input.sortOrder,
        linkedThreadId,
        updatedAt: now,
      };
      yield* repository.upsertTask(updated);
      return taskRowToTask(updated);
    }).pipe(Effect.orDie);

  const stopTask: KanbanServiceShape["stopTask"] = (input) =>
    Effect.gen(function* () {
      const taskOption = yield* repository.getTask({ taskId: input.taskId });
      if (Option.isNone(taskOption)) {
        return yield* Effect.die(new Error(`KanbanTask not found: ${input.taskId}`));
      }
      const existing = taskOption.value;

      // Dispatch interrupt if the task has an active linked thread
      if (existing.linkedThreadId !== null) {
        const now = new Date().toISOString() as IsoDateTime;
        yield* orchestrationEngine
          .dispatch({
            type: "thread.turn.interrupt",
            commandId: serverCommandId("kanban-stop-task"),
            threadId: existing.linkedThreadId,
            createdAt: now,
          })
          .pipe(Effect.ignore);
      }

      const now = new Date().toISOString() as IsoDateTime;
      const updated: KanbanTaskRow = {
        ...existing,
        column: "waiting",
        linkedThreadId: null,
        updatedAt: now,
      };
      yield* repository.upsertTask(updated);
      return taskRowToTask(updated);
    }).pipe(Effect.orDie);

  const deleteTask: KanbanServiceShape["deleteTask"] = (input) =>
    Effect.gen(function* () {
      const taskOption = yield* repository.getTask({ taskId: input.taskId });
      if (Option.isNone(taskOption)) {
        return yield* Effect.die(new Error(`KanbanTask not found: ${input.taskId}`));
      }
      const projectId = taskOption.value.projectId;
      yield* repository.deleteTask({ taskId: input.taskId });
      return { taskId: input.taskId, projectId };
    }).pipe(Effect.orDie);

  const updateTaskTodos: KanbanServiceShape["updateTaskTodos"] = (input) =>
    Effect.gen(function* () {
      const taskOption = yield* repository.getTask({ taskId: input.taskId });
      if (Option.isNone(taskOption)) {
        return yield* Effect.die(new Error(`KanbanTask not found: ${input.taskId}`));
      }
      const existing = taskOption.value;
      const now = new Date().toISOString() as IsoDateTime;
      const updated: KanbanTaskRow = {
        ...existing,
        todos: input.todos,
        updatedAt: now,
      };
      yield* repository.upsertTask(updated);
      return taskRowToTask(updated);
    }).pipe(Effect.orDie);

  return {
    getBoardConfig,
    updateBoardConfig,
    listTasks,
    createTask,
    updateTask,
    moveTask,
    stopTask,
    deleteTask,
    updateTaskTodos,
  } satisfies KanbanServiceShape;
});

export const KanbanServiceLive = Layer.effect(KanbanService, makeKanbanService);
