import {
  CommandId,
  KANBAN_WS_CHANNELS,
  MessageId,
  ThreadId,
  type KanbanTaskError,
  type KanbanTodo,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import { Cause, Effect, Layer, Option, Stream } from "effect";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";

import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import {
  KanbanRepository,
  type KanbanTaskRow,
} from "../../persistence/Services/KanbanRepository.ts";
import { ServerPushBusService } from "../../wsServer/ServerPushBusService.ts";
import { KanbanTaskReactor, type KanbanTaskReactorShape } from "../Services/KanbanTaskReactor.ts";

type ReactorInput = Extract<OrchestrationEvent, { type: "thread.session-set" }>;

const serverCommandId = (tag: string): CommandId =>
  CommandId.makeUnsafe(`server:${tag}:${crypto.randomUUID()}`);

const make = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const repository = yield* KanbanRepository;
  const pushBus = yield* ServerPushBusService;

  const handleSessionSet = Effect.fnUntraced(function* (event: ReactorInput) {
    const { threadId, session } = event.payload;
    const status = session.status;

    // Only act on terminal session states
    if (
      status !== "idle" &&
      status !== "stopped" &&
      status !== "interrupted" &&
      status !== "error"
    ) {
      return;
    }

    // Find the task linked to this thread
    const taskOption = yield* repository.getTaskByLinkedThread({ linkedThreadId: threadId });
    if (Option.isNone(taskOption)) {
      return;
    }
    const task = taskOption.value;

    // If the session was manually stopped or interrupted, KanbanService.stopTask already
    // handled moving the task back to waiting. Skip processing.
    if (status === "stopped" || status === "interrupted") {
      return;
    }

    const now = new Date().toISOString();

    // ── Agent failed ──────────────────────────────────────────────────────

    if (status === "error") {
      const errorComment: KanbanTaskError = {
        occurredAt: now,
        column: task.column,
        message: session.lastError ?? "Agent error",
      };
      const updated: KanbanTaskRow = {
        ...task,
        column: "waiting",
        linkedThreadId: null,
        errorComments: [...task.errorComments, errorComment],
        updatedAt: now,
      };
      yield* repository.upsertTask(updated);
      yield* pushBus
        .publishAll(KANBAN_WS_CHANNELS.domainEvent, {
          type: "task.error",
          task: {
            id: updated.id,
            projectId: updated.projectId,
            title: updated.title,
            description: updated.description,
            column: updated.column,
            sortOrder: updated.sortOrder,
            linkedThreadId: updated.linkedThreadId,
            agentFindings: updated.agentFindings,
            errorComments: updated.errorComments,
            todos: updated.todos,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
          },
        })
        .pipe(Effect.ignore);
      return;
    }

    // ── Agent completed (status === "idle") ───────────────────────────────

    // Only act when the latest turn completed successfully
    const readModel = yield* orchestrationEngine.getReadModel();
    const thread = readModel.threads.find((t) => t.id === threadId);
    if (!thread) {
      return;
    }
    if (thread.latestTurn?.state !== "completed") {
      return;
    }

    // ── Completed while planning: parse plan into todos ───────────────────

    if (task.column === "planning") {
      const lastAssistantMessage = thread.messages.toReversed().find((m) => m.role === "assistant");
      const planText = lastAssistantMessage?.text ?? "";

      // Parse bullet/numbered list items into todos
      const todoLines: string[] = [];
      for (const line of planText.split("\n")) {
        const bulletMatch = /^[\-\*]\s+(.+)$/.exec(line.trim());
        if (bulletMatch?.[1]) {
          todoLines.push(bulletMatch[1].trim());
          continue;
        }
        const numberedMatch = /^\d+\.\s+(.+)$/.exec(line.trim());
        if (numberedMatch?.[1]) {
          todoLines.push(numberedMatch[1].trim());
        }
      }

      const todos: KanbanTodo[] = todoLines.map((text) => ({
        id: crypto.randomUUID(),
        text,
        accepted: false,
        createdAt: now,
      }));

      const updated: KanbanTaskRow = {
        ...task,
        todos,
        linkedThreadId: null,
        updatedAt: now,
      };
      yield* repository.upsertTask(updated);
      yield* pushBus
        .publishAll(KANBAN_WS_CHANNELS.domainEvent, {
          type: "task.todos-updated",
          task: {
            id: updated.id,
            projectId: updated.projectId,
            title: updated.title,
            description: updated.description,
            column: updated.column,
            sortOrder: updated.sortOrder,
            linkedThreadId: updated.linkedThreadId,
            agentFindings: updated.agentFindings,
            errorComments: updated.errorComments,
            todos: updated.todos,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
          },
        })
        .pipe(Effect.ignore);
      return;
    }

    // ── Completed while in_progress: promote to testing ───────────────────

    if (task.column === "in_progress") {
      const project = readModel.projects.find((p) => p.id === task.projectId);
      const model = project?.defaultModel ?? "codex";

      // Get board config for the testing prompt
      const configOption = yield* repository.getConfig({ projectId: task.projectId });
      const testingPrompt = Option.isSome(configOption)
        ? configOption.value.testingPrompt
        : "You are a senior QA engineer. Test the following task implementation thoroughly.";

      const newThreadId = ThreadId.makeUnsafe(crypto.randomUUID());
      const newThreadCreatedAt = new Date().toISOString();

      // Create the testing thread
      yield* orchestrationEngine.dispatch({
        type: "thread.create",
        commandId: serverCommandId("kanban-testing-thread-create"),
        threadId: newThreadId,
        projectId: task.projectId,
        title: `Testing: ${task.title}`,
        model,
        interactionMode: "default",
        runtimeMode: "full-access",
        branch: null,
        worktreePath: null,
        createdAt: newThreadCreatedAt,
      });

      // Send the initial testing turn
      yield* orchestrationEngine.dispatch({
        type: "thread.turn.start",
        commandId: serverCommandId("kanban-testing-turn-start"),
        threadId: newThreadId,
        interactionMode: "default",
        message: {
          messageId: MessageId.makeUnsafe(crypto.randomUUID()),
          role: "user",
          text: `${testingPrompt}\n\nTask: ${task.title}\n\n${task.description}`,
          attachments: [],
        },
        runtimeMode: "full-access",
        createdAt: new Date().toISOString(),
      });

      const updated: KanbanTaskRow = {
        ...task,
        column: "testing",
        linkedThreadId: newThreadId,
        updatedAt: now,
      };
      yield* repository.upsertTask(updated);
      yield* pushBus
        .publishAll(KANBAN_WS_CHANNELS.domainEvent, {
          type: "task.moved",
          task: {
            id: updated.id,
            projectId: updated.projectId,
            title: updated.title,
            description: updated.description,
            column: updated.column,
            sortOrder: updated.sortOrder,
            linkedThreadId: updated.linkedThreadId,
            agentFindings: updated.agentFindings,
            errorComments: updated.errorComments,
            todos: updated.todos,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
          },
        })
        .pipe(Effect.ignore);
      return;
    }

    // ── Completed while testing: promote to complete ──────────────────────

    if (task.column === "testing") {
      // Extract agent findings from the last assistant message in the thread
      const lastAssistantMessage = thread.messages.toReversed().find((m) => m.role === "assistant");
      const agentFindings = lastAssistantMessage?.text ?? null;

      const updated: KanbanTaskRow = {
        ...task,
        column: "complete",
        linkedThreadId: null,
        agentFindings,
        updatedAt: now,
      };
      yield* repository.upsertTask(updated);
      yield* pushBus
        .publishAll(KANBAN_WS_CHANNELS.domainEvent, {
          type: "task.moved",
          task: {
            id: updated.id,
            projectId: updated.projectId,
            title: updated.title,
            description: updated.description,
            column: updated.column,
            sortOrder: updated.sortOrder,
            linkedThreadId: updated.linkedThreadId,
            agentFindings: updated.agentFindings,
            errorComments: updated.errorComments,
            todos: updated.todos,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
          },
        })
        .pipe(Effect.ignore);
      return;
    }
  });

  const processEvent = (event: ReactorInput) =>
    handleSessionSet(event).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.failCause(cause);
        }
        return Effect.logWarning("kanban task reactor failed to process event", {
          eventType: event.type,
          threadId: event.payload.threadId,
          sessionStatus: event.payload.session.status,
          cause: Cause.pretty(cause),
        });
      }),
    );

  const worker = yield* makeDrainableWorker(processEvent);

  const start: KanbanTaskReactorShape["start"] = Effect.forkScoped(
    Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
      if (event.type !== "thread.session-set") {
        return Effect.void;
      }
      return worker.enqueue(event);
    }),
  ).pipe(Effect.asVoid);

  return {
    start,
    drain: worker.drain,
  } satisfies KanbanTaskReactorShape;
});

export const KanbanTaskReactorLive = Layer.effect(KanbanTaskReactor, make);
