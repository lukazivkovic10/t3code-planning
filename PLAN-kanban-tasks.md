# Plan: Kanban Task Board with AI Agent Automation

## Overview

Each project gets a Kanban board with 4 columns: **Waiting → In Progress → Testing → Complete**. When a task enters an agent-driven column, an AI workflow is automatically triggered using that column's configurable system prompt. Users can customize the system prompt per column per board.

---

## Feature Requirements Summary

| Column      | Agent? | Trigger                          | Completes When            |
| ----------- | ------ | -------------------------------- | ------------------------- |
| Waiting     | No     | Manual task creation             | User drags to In Progress |
| In Progress | Yes    | Task moves into column           | Agent turn completes      |
| Testing     | Yes    | Task auto-moves from In Progress | Agent turn completes      |
| Complete    | No     | Auto-moved from Testing          | —                         |

---

## Architecture Decisions

1. **Per-project board** — one KanbanBoard per project (1:1 relationship)
2. **Tasks are independent entities** — not threads; they _link_ to threads when agents run
3. **Agent execution reuses the existing Thread/Provider infrastructure** — a task in "In Progress" or "Testing" spawns a new Thread, sends an initial message, and the existing `ProviderService` handles the rest
4. **Column prompts are stored on the board config** — editable per-column, persisted in DB
5. **Auto-advancement** — a new `KanbanTaskReactor` watches turn completions and moves tasks forward
6. **Event-sourced** — follows the existing `orchestration_events` pattern; kanban events are stored in the same event store

---

## Phase 1: Data Models & Contracts

### 1.1 New file: `packages/contracts/src/kanban.ts`

```ts
// Column types
export type KanbanColumnId = "waiting" | "in_progress" | "testing" | "complete";

// Board config (per project)
export interface KanbanBoardConfig {
  projectId: ProjectId;
  inProgressPrompt: string; // system prompt for In Progress agent
  testingPrompt: string; // system prompt for Testing agent
  updatedAt: Date;
}

// Task
export interface KanbanTask {
  id: KanbanTaskId; // branded string
  projectId: ProjectId;
  title: string;
  description: string; // markdown, rendered with Lexical editor
  column: KanbanColumnId;
  order: number; // sort order within column (float for easy reorder)
  linkedThreadId: ThreadId | null; // set when agent is running
  agentFindings: string | null; // populated when testing agent completes
  errorComments: KanbanTaskError[]; // appended on agent failure
  createdAt: Date;
  updatedAt: Date;
}

export interface KanbanTaskError {
  occurredAt: Date;
  column: KanbanColumnId; // which column the agent was in when it failed
  message: string; // error message from the agent/turn
}
```

### 1.2 WS Protocol additions (`packages/contracts/src/ws.ts`)

New request/response pairs:

- `kanban.board.getConfig` → `KanbanBoardConfig`
- `kanban.board.updateConfig` → `KanbanBoardConfig`
- `kanban.task.list` → `KanbanTask[]`
- `kanban.task.create` → `KanbanTask`
- `kanban.task.update` → `KanbanTask` (title/description)
- `kanban.task.move` → `KanbanTask` (column + order)
- `kanban.task.delete` → `void`

New push event channel: `kanban.domainEvent`

- Payload: `{ type: "task.created" | "task.updated" | "task.moved" | "config.updated", data: KanbanTask | KanbanBoardConfig }`

---

## Phase 2: Database & Persistence

### 2.1 New migration file: `apps/server/src/persistence/Migrations/`

Two new tables:

```sql
-- Board config (one per project)
CREATE TABLE kanban_board_configs (
  project_id TEXT PRIMARY KEY,
  in_progress_prompt TEXT NOT NULL DEFAULT '',
  testing_prompt TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

-- Tasks
CREATE TABLE kanban_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  column_id TEXT NOT NULL DEFAULT 'waiting',
  sort_order REAL NOT NULL DEFAULT 0,
  linked_thread_id TEXT,
  agent_findings TEXT,
  error_comments TEXT NOT NULL DEFAULT '[]',   -- JSON array of KanbanTaskError
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_kanban_tasks_project ON kanban_tasks(project_id, column_id, sort_order);
```

### 2.2 New service: `apps/server/src/persistence/ProjectionKanbanTasks.ts`

Effect service wrapping SQL queries for tasks and board configs. Pattern mirrors existing `ProjectionThreads.ts`.

Methods:

- `getConfig(projectId)` → `KanbanBoardConfig`
- `upsertConfig(projectId, patch)` → `KanbanBoardConfig`
- `listTasks(projectId)` → `KanbanTask[]`
- `getTask(taskId)` → `KanbanTask | null`
- `insertTask(task)` → `KanbanTask`
- `updateTask(taskId, patch)` → `KanbanTask`
- `moveTask(taskId, column, order)` → `KanbanTask`
- `deleteTask(taskId)` → `void`
- `linkThread(taskId, threadId)` → `void`
- `saveFindings(taskId, findings)` → `void`
- `appendErrorComment(taskId, error: KanbanTaskError)` → `void`

---

## Phase 3: Backend Orchestration

### 3.1 Orchestration commands

Add to `apps/server/src/orchestration/OrchestrationEngine.ts` (or a new `KanbanCommandHandler.ts`):

**`kanban.board.updateConfig`**

- Validates projectId exists
- Upserts `kanban_board_configs`
- Emits push event `kanban.domainEvent { type: "config.updated" }`

**`kanban.task.create`**

- Generates task ID
- Inserts into `kanban_tasks` with column = `"waiting"`
- Emits push event `{ type: "task.created" }`

**`kanban.task.update`**

- Updates title/description only
- Emits push event `{ type: "task.updated" }`

**`kanban.task.move`**

- Updates column + sort_order
- Emits push event `{ type: "task.moved" }`
- If moving **into** `in_progress` or `testing`: also enqueues `KanbanAgentTrigger` domain event for the reactor (see §3.2)

**`kanban.task.delete`**

- Soft-delete or hard-delete
- Emits push event `{ type: "task.deleted" }`

### 3.2 New reactor: `apps/server/src/orchestration/KanbanTaskReactor.ts`

Reacts to two event types:

**On `KanbanAgentTrigger` (task moved into `in_progress` or `testing`):**

1. Load task + board config from DB
2. Create a new Thread linked to the project (`thread.create`)
3. Set the thread's `runtimeMode` to `"full-access"`
4. Send an initial message:
   - System: `<column prompt from board config>`
   - User: `Task: <title>\n\n<description>`
5. Persist `linked_thread_id` on the task
6. Emit `kanban.domainEvent { type: "task.updated" }` so the UI can show a link to the thread

**On `OrchestrationTurnCompleted` (any turn completes successfully):**

1. Check if the completed turn's `threadId` is linked to a `KanbanTask`
2. If task is in `in_progress`: move task to `testing`, trigger testing agent, emit toast notification
3. If task is in `testing`:
   - Extract the last assistant message as `agentFindings`
   - Move task to `complete`
   - Emit `kanban.domainEvent { type: "task.moved" }`
   - Emit toast notification: "Task '<title>' is complete and ready for review"

**On `OrchestrationTurnFailed` / `OrchestrationTurnErrored`:**

1. Check if the failed turn's `threadId` is linked to a `KanbanTask`
2. Move task back to `waiting`
3. Append an error comment to the task: timestamp, column where failure occurred, and the error message so the user knows what to adjust in the task description or board prompt
4. Emit `kanban.domainEvent { type: "task.error" }`
5. Emit toast notification: "Task '<title>' encountered an error and was moved back to Waiting"

### 3.3 WS Server routes (`apps/server/src/wsServer.ts`)

Register the new `kanban.*` request handlers, calling the orchestration commands and persistence layer.

---

## Phase 4: Frontend

### 4.1 New route: `apps/web/src/routes/_kanban.$projectId.tsx`

- Fetches tasks and board config on mount via WS requests
- Subscribes to `kanban.domainEvent` push channel
- Renders `<KanbanBoard />`

Add navigation link to `Sidebar.tsx` (kanban icon per project, using an existing icon from the icon set).

### 4.2 New store: `apps/web/src/kanbanStore.ts`

Zustand store:

```ts
interface KanbanStore {
  tasksByProject: Record<ProjectId, KanbanTask[]>;
  configByProject: Record<ProjectId, KanbanBoardConfig>;
  // actions
  setTasks(projectId, tasks): void;
  upsertTask(task): void;
  removeTask(taskId): void;
  setConfig(projectId, config): void;
}
```

Hydrated from WS push events (`kanban.domainEvent`).

### 4.3 New components (`apps/web/src/components/kanban/`)

#### `KanbanBoard.tsx`

- Top-level layout: 4 column flex/grid
- Contains column settings button (opens `KanbanBoardSettings` modal)
- Passes `@dnd-kit` context for drag-and-drop between columns

#### `KanbanColumn.tsx`

- Column header with task count badge
- `useDroppable` from `@dnd-kit`
- Renders list of `KanbanCard` components
- "Add task" button at bottom of Waiting column (other columns are agent-controlled)

#### `KanbanCard.tsx`

- Draggable card (`useDraggable`) — drag handle disabled when agent is running
- Shows: title, truncated description, status indicator
- Click opens `KanbanTaskModal`
- If `linkedThreadId` is set: shows a "View thread" link
- Agent columns show a spinner while agent is running (linked thread session `status === "running"`)
- Agent columns show a "Stop" button (calls `turn.interrupt` + moves task back to `waiting`)
- If `errorComments` is non-empty and column is `waiting`: shows a red error badge on the card
- Complete cards show a "Create PR" button directly on the card (shortcut without opening the modal)

#### `KanbanTaskModal.tsx`

- Create/edit form: title + Lexical rich-text editor for description
- Read-only view for In Progress / Testing cards (can't edit while agent is running)
- If task has `errorComments`: shows a collapsible "Agent Errors" section with timestamps and which column each error occurred in — helps user understand what to fix in the description or board prompt
- If Complete: shows `agentFindings` in a collapsible "Agent Report" section with markdown rendering
- If Complete: shows a **"Create PR"** button — reuses the existing `GitActionsControl` / PR creation logic already in the codebase, pre-populated with the task title as the PR title and `agentFindings` as the PR description body

#### `KanbanBoardSettings.tsx`

- Tab panel: one tab per agent column ("In Progress", "Testing")
- Each tab has a `<textarea>` or `<ComposerPromptEditor>` for the system prompt
- Save triggers `kanban.board.updateConfig`

### 4.4 Drag-and-drop behavior

Uses existing `@dnd-kit` dependency.

- Cards in `waiting` are freely draggable to `in_progress` (user-initiated start)
- Cards in `in_progress` or `testing` are **disabled/locked** — the card is not draggable while an agent is running
- All subsequent column advances (`in_progress` → `testing` → `complete`) are agent-controlled only
- On drop (waiting → in_progress): calculate new `order`, dispatch `kanban.task.move`, optimistic update with rollback on error
- **Stop & revert:** cards in agent columns show a "Stop" button — clicking it interrupts the agent turn (reuses existing `turn.interrupt`) and moves the task back to `waiting`

### 4.5 WS native API handler additions (`apps/web/src/wsNativeApi.ts`)

Handle `kanban.domainEvent` push:

- Dispatch to `kanbanStore` based on event type

---

## Phase 5: Default Prompts

Ship sensible defaults for the two column prompts so the feature works out-of-the-box without configuration:

**In Progress default:**

```
You are an expert software engineer. You have been assigned a development task.
Read the task title and description carefully, then implement the feature completely.
Write clean, maintainable code following the project's existing patterns and conventions.
When you are done, summarize what you built.
```

**Testing default:**

```
You are a senior QA engineer and test automation expert.
You have been given a completed feature to test.
Write comprehensive tests covering happy paths, edge cases, and error conditions.
Run the tests and fix any failures until all tests pass.
Check for security vulnerabilities and common anti-patterns.
When done, summarize your findings, what tests you wrote, and any issues you found.
```

---

## Phase 6: Findings & Documentation

When the testing agent finishes, the last assistant message is saved as `agentFindings`. The Complete card displays this in a collapsible "Agent Report" section with markdown rendering.

---

## Implementation Order

1. **Contracts** — add `kanban.ts`, extend `ws.ts` schemas
2. **DB migration** — add two new tables
3. **Persistence layer** — `ProjectionKanbanTasks.ts`
4. **Orchestration commands** — command handlers for all `kanban.*` commands
5. **KanbanTaskReactor** — agent trigger + auto-advancement logic
6. **WS routes** — wire up commands in `wsServer.ts`
7. **kanbanStore** — Zustand store + push event handling
8. **KanbanBoard UI** — components in `apps/web/src/components/kanban/`
9. **Routing** — new route, sidebar link
10. **Polish** — loading states, error handling, toasts, animations

---

## Resolved Decisions

1. **Manual advancement while agent is running** — **Not allowed.** Card is locked/disabled. User must click "Stop" to interrupt the agent, which moves the task back to Waiting. They can then edit the description or board prompt and restart.
2. **Agent failure handling** — **Revert to Waiting.** Append an error comment to the task with the timestamp, the column where it failed, and the error message so the user knows what to adjust.
3. **Notifications** — **Yes.** Toast notifications when a task auto-advances to a new column and when it completes or errors.
4. **PR on Complete** — Complete cards show a "Create PR" button, reusing existing git/PR infrastructure. Pre-populates PR title from task title and PR body from `agentFindings`.

## Open Questions

1. **Multiple boards?** Current design is one board per project. Future: multiple named boards per project (would require `boardId` foreign key on tasks).
2. **Task assignment to existing thread?** Option to link an existing thread instead of spawning a new one.
3. **PR branch source** — when "Create PR" is clicked on a Complete card, which branch should it use? The thread's `branch` / `worktreePath` from the linked testing thread is the most accurate source.
