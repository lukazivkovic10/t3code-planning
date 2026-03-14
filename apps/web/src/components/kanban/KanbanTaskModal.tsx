import { useState } from "react";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react";
import {
  IsoDateTime,
  ProjectId,
  type KanbanTask,
  type KanbanTodo,
} from "@t3tools/contracts";

import { readNativeApi } from "~/nativeApi";
import { useKanbanStore } from "~/kanbanStore";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import { ToggleGroup, Toggle } from "~/components/ui/toggle-group";
import {
  type TaskType,
  TASK_TYPE_CONFIG,
  parseDescription,
  compileDescription,
} from "./kanbanTaskUtils";

interface KanbanTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing task to view/edit — undefined for create mode */
  task?: KanbanTask;
  /** Required for create mode */
  projectId?: string;
}

export function KanbanTaskModal({
  open,
  onOpenChange,
  task,
  projectId,
}: KanbanTaskModalProps) {
  const parsed = task
    ? parseDescription(task.description ?? "")
    : { type: "feature" as TaskType, detail: "", acceptance: "", hints: "" };

  const [title, setTitle] = useState(task?.title ?? "");
  const [saving, setSaving] = useState(false);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [findingsExpanded, setFindingsExpanded] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [taskType, setTaskType] = useState<TaskType>(parsed.type);
  const [taskDetail, setTaskDetail] = useState(parsed.detail);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(
    parsed.acceptance,
  );
  const [technicalHints, setTechnicalHints] = useState(parsed.hints);

  const handleDomainEvent = useKanbanStore((s) => s.handleDomainEvent);

  const [todos, setTodos] = useState<KanbanTodo[]>(() => [
    ...(task?.todos ?? []),
  ]);
  const [newTodoText, setNewTodoText] = useState("");
  const [savingTodos, setSavingTodos] = useState(false);

  const isCreate = !task;
  const isEditable = !task || task.column === "waiting";
  const isPlanning = task?.column === "planning";
  const isAgentRunning =
    task?.column === "in_progress" ||
    task?.column === "testing" ||
    (isPlanning && task?.linkedThreadId !== null);
  const isComplete = task?.column === "complete";
  const hasErrors = (task?.errorComments.length ?? 0) > 0;
  const showTodos = isPlanning || (task?.todos && task.todos.length > 0);

  const STEP2_LABEL: Record<TaskType, string> = {
    feature: "What should this feature do? Describe the expected behavior.",
    bugfix: "What's broken? What's the expected vs actual behavior?",
    refactor: "What needs to be improved and why?",
    other: "Describe the task in detail.",
  };

  function resetForm() {
    const p = task
      ? parseDescription(task.description ?? "")
      : { type: "feature" as TaskType, detail: "", acceptance: "", hints: "" };
    setTitle(task?.title ?? "");
    setWizardStep(1);
    setTaskType(p.type);
    setTaskDetail(p.detail);
    setAcceptanceCriteria(p.acceptance);
    setTechnicalHints(p.hints);
    setTodos([...(task?.todos ?? [])]);
    setNewTodoText("");
  }

  async function handleTodoToggle(todoId: string) {
    if (!task) return;
    const api = readNativeApi();
    if (!api) return;
    const updated = todos.map((t) =>
      t.id === todoId ? { ...t, accepted: !t.accepted } : t,
    );
    setTodos(updated);
    setSavingTodos(true);
    try {
      const result = await api.kanban.updateTaskTodos({
        taskId: task.id,
        todos: updated,
      });
      handleDomainEvent({ type: "task.todos-updated", task: result });
    } finally {
      setSavingTodos(false);
    }
  }

  async function handleAddTodo() {
    if (!task || !newTodoText.trim()) return;
    const api = readNativeApi();
    if (!api) return;
    const newTodo: KanbanTodo = {
      id: crypto.randomUUID(),
      text: newTodoText.trim(),
      accepted: false,
      createdAt: new Date().toISOString() as IsoDateTime,
    };
    const updated = [...todos, newTodo];
    setTodos(updated);
    setNewTodoText("");
    setSavingTodos(true);
    try {
      const result = await api.kanban.updateTaskTodos({
        taskId: task.id,
        todos: updated,
      });
      handleDomainEvent({ type: "task.todos-updated", task: result });
    } finally {
      setSavingTodos(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  async function handleSave() {
    const api = readNativeApi();
    if (!api) return;
    setSaving(true);
    try {
      if (isCreate) {
        const pid = ProjectId.makeUnsafe(projectId ?? "");
        const created = await api.kanban.createTask({
          projectId: pid,
          title,
          description: compileDescription(
            taskType,
            taskDetail,
            acceptanceCriteria,
            technicalHints,
          ),
        });
        handleDomainEvent({ type: "task.created", task: created });
      } else {
        const updated = await api.kanban.updateTask({
          taskId: task.id,
          title,
          description: compileDescription(
            taskType,
            taskDetail,
            acceptanceCriteria,
            technicalHints,
          ),
        });
        handleDomainEvent({ type: "task.updated", task: updated });
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    const api = readNativeApi();
    if (!api) return;
    await api.kanban.deleteTask({ taskId: task.id });
    handleDomainEvent({
      type: "task.deleted",
      taskId: task.id,
      projectId: task.projectId,
    });
    onOpenChange(false);
  }

  const columnLabel: Record<string, string> = {
    waiting: "New",
    planning: "Planning",
    in_progress: "In Progress",
    testing: "Testing",
    complete: "Complete",
  };

  const typeConfig = TASK_TYPE_CONFIG[taskType];
  const TypeIcon = typeConfig.icon;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <div className="flex items-start gap-3 pr-8">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <DialogTitle>
                {isCreate ? `New Task — Step ${wizardStep} of 3` : task.title}
              </DialogTitle>
              {task && (
                <DialogDescription>
                  {columnLabel[task.column]}
                  {isAgentRunning && " — agent is running"}
                </DialogDescription>
              )}
            </div>
            {!isCreate && (
              <div
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${typeConfig.className}`}
              >
                <TypeIcon className="size-3.5" />
                {typeConfig.label}
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 pb-2">
          {isCreate ? (
            <>
              {wizardStep === 1 && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Task type</label>
                    <ToggleGroup
                      variant="outline"
                      value={[taskType]}
                      onValueChange={(v) => {
                        const next = v[0];
                        if (next) setTaskType(next as TaskType);
                      }}
                      className="w-full"
                    >
                      <Toggle value="feature" className="flex-1">
                        Feature
                      </Toggle>
                      <Toggle value="bugfix" className="flex-1">
                        Bug Fix
                      </Toggle>
                      <Toggle value="refactor" className="flex-1">
                        Refactor
                      </Toggle>
                      <Toggle value="other" className="flex-1">
                        Other
                      </Toggle>
                    </ToggleGroup>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Title</label>
                    <input
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Task title"
                      autoFocus
                    />
                  </div>
                </>
              )}

              {wizardStep === 2 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Describe it</label>
                  <textarea
                    className="min-h-32 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={taskDetail}
                    onChange={(e) => setTaskDetail(e.target.value)}
                    placeholder={STEP2_LABEL[taskType]}
                    autoFocus
                  />
                </div>
              )}

              {wizardStep === 3 && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">
                      Acceptance criteria
                    </label>
                    <textarea
                      className="min-h-28 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={acceptanceCriteria}
                      onChange={(e) => setAcceptanceCriteria(e.target.value)}
                      placeholder="How will you know this task is done?"
                      autoFocus
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-muted-foreground">
                      Technical hints{" "}
                      <span className="font-normal">(optional)</span>
                    </label>
                    <textarea
                      className="min-h-20 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={technicalHints}
                      onChange={(e) => setTechnicalHints(e.target.value)}
                      placeholder="Any specific files, libraries, or constraints?"
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {/* Title */}
              {isEditable ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Title</label>
                  <input
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Task title"
                  />
                </div>
              ) : null}

              {/* Task type */}
              {isEditable && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Task type</label>
                  <ToggleGroup
                    variant="outline"
                    value={[taskType]}
                    onValueChange={(v) => {
                      const next = v[0];
                      if (next) setTaskType(next as TaskType);
                    }}
                    className="w-full"
                  >
                    <Toggle value="feature" className="flex-1">
                      Feature
                    </Toggle>
                    <Toggle value="bugfix" className="flex-1">
                      Bug Fix
                    </Toggle>
                    <Toggle value="refactor" className="flex-1">
                      Refactor
                    </Toggle>
                    <Toggle value="other" className="flex-1">
                      Other
                    </Toggle>
                  </ToggleGroup>
                </div>
              )}

              {/* Goal */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Goal</label>
                {isEditable ? (
                  <textarea
                    className="min-h-24 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={taskDetail}
                    onChange={(e) => setTaskDetail(e.target.value)}
                    placeholder="Describe the task…"
                  />
                ) : (
                  <p className="whitespace-pre-wrap rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    {taskDetail || <em>No description</em>}
                  </p>
                )}
              </div>

              {/* Acceptance criteria */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">
                  Acceptance criteria
                </label>
                {isEditable ? (
                  <textarea
                    className="min-h-20 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={acceptanceCriteria}
                    onChange={(e) => setAcceptanceCriteria(e.target.value)}
                    placeholder="How will you know this task is done?"
                  />
                ) : acceptanceCriteria ? (
                  <p className="whitespace-pre-wrap rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    {acceptanceCriteria}
                  </p>
                ) : null}
              </div>

              {/* Technical hints */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Technical hints{" "}
                  <span className="font-normal">(optional)</span>
                </label>
                {isEditable ? (
                  <textarea
                    className="min-h-16 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={technicalHints}
                    onChange={(e) => setTechnicalHints(e.target.value)}
                    placeholder="Any specific files, libraries, or constraints?"
                  />
                ) : technicalHints ? (
                  <p className="whitespace-pre-wrap rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    {technicalHints}
                  </p>
                ) : null}
              </div>

              {/* Todos section (planning column) */}
              {showTodos && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    Planning Todos
                    {savingTodos && (
                      <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
                    )}
                    {isPlanning && isAgentRunning && !savingTodos && (
                      <span className="text-xs font-normal text-muted-foreground">
                        AI is planning…
                      </span>
                    )}
                  </label>
                  {todos.length === 0 && isPlanning && isAgentRunning && (
                    <p className="text-xs text-muted-foreground italic">
                      Waiting for AI to generate steps…
                    </p>
                  )}
                  {todos.length > 0 && (
                    <ul className="flex flex-col gap-1.5">
                      {todos.map((todo) => (
                        <li key={todo.id} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={todo.accepted}
                            onChange={() => void handleTodoToggle(todo.id)}
                            disabled={!isPlanning || savingTodos}
                            className="mt-0.5 cursor-pointer"
                          />
                          <span
                            className={`text-sm ${todo.accepted ? "line-through text-muted-foreground" : ""}`}
                          >
                            {todo.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {isPlanning && (
                    <div className="flex gap-2 mt-1">
                      <input
                        className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        value={newTodoText}
                        onChange={(e) => setNewTodoText(e.target.value)}
                        placeholder="Add a step…"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleAddTodo();
                        }}
                      />
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                        onClick={() => void handleAddTodo()}
                        disabled={!newTodoText.trim() || savingTodos}
                      >
                        <PlusIcon className="size-3.5" />
                        Add
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* View thread link */}
              {task?.linkedThreadId && (
                <p className="text-xs text-muted-foreground">
                  Agent thread:{" "}
                  <a
                    href={`/${task.linkedThreadId}`}
                    className="underline hover:text-foreground"
                    onClick={() => onOpenChange(false)}
                  >
                    View thread →
                  </a>
                </p>
              )}

              {/* Error comments */}
              {hasErrors && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm font-medium text-destructive"
                    onClick={() => setErrorsExpanded((v) => !v)}
                  >
                    <AlertCircleIcon className="size-4" />
                    Agent Errors ({task!.errorComments.length})
                    <ChevronDownIcon
                      className={`size-3.5 ml-auto transition-transform ${errorsExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  {errorsExpanded && (
                    <ul className="flex flex-col gap-2">
                      {task!.errorComments.map((err) => (
                        <li
                          key={`${err.occurredAt}-${err.column}`}
                          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
                        >
                          <span className="font-medium text-destructive/80">
                            {err.column} —{" "}
                            {new Date(err.occurredAt).toLocaleString()}
                          </span>
                          <p className="mt-1 text-muted-foreground">
                            {err.message}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Agent findings (complete) */}
              {isComplete && task.agentFindings && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400"
                    onClick={() => setFindingsExpanded((v) => !v)}
                  >
                    Agent Report
                    <ChevronDownIcon
                      className={`size-3.5 ml-auto transition-transform ${findingsExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  {findingsExpanded && (
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      {task.agentFindings}
                    </pre>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter variant="bare">
          {isCreate ? (
            <>
              <Button
                variant="ghost"
                onClick={() =>
                  wizardStep === 1
                    ? onOpenChange(false)
                    : setWizardStep((s) => (s - 1) as 1 | 2 | 3)
                }
              >
                {wizardStep === 1 ? "Cancel" : "Back"}
              </Button>
              {wizardStep < 3 ? (
                <Button
                  onClick={() => setWizardStep((s) => (s + 1) as 2 | 3)}
                  disabled={
                    wizardStep === 1 ? !title.trim() : !taskDetail.trim()
                  }
                >
                  Next
                </Button>
              ) : (
                <Button
                  onClick={() => void handleSave()}
                  disabled={saving || !acceptanceCriteria.trim()}
                >
                  {saving ? "Creating…" : "Create"}
                </Button>
              )}
            </>
          ) : (
            <>
              {task && isEditable && (
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive mr-auto"
                  onClick={() => void handleDelete()}
                >
                  Delete
                </Button>
              )}
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {isEditable ? "Cancel" : "Close"}
              </Button>
              {isEditable && (
                <Button
                  onClick={() => void handleSave()}
                  disabled={saving || !title.trim()}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
