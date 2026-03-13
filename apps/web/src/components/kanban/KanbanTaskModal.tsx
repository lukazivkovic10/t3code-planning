import { useState } from "react";
import { AlertCircleIcon, ChevronDownIcon } from "lucide-react";
import { ProjectId, type KanbanTask } from "@t3tools/contracts";

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

interface KanbanTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing task to view/edit — undefined for create mode */
  task?: KanbanTask;
  /** Required for create mode */
  projectId?: string;
}

export function KanbanTaskModal({ open, onOpenChange, task, projectId }: KanbanTaskModalProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [findingsExpanded, setFindingsExpanded] = useState(false);

  const handleDomainEvent = useKanbanStore((s) => s.handleDomainEvent);

  const isCreate = !task;
  const isEditable = !task || task.column === "waiting";
  const isAgentRunning = task?.column === "in_progress" || task?.column === "testing";
  const isComplete = task?.column === "complete";
  const hasErrors = (task?.errorComments.length ?? 0) > 0;

  function resetForm() {
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
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
        const created = await api.kanban.createTask({ projectId: pid, title, description });
        handleDomainEvent({ type: "task.created", task: created });
      } else {
        const updated = await api.kanban.updateTask({ taskId: task.id, title, description });
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
    handleDomainEvent({ type: "task.deleted", taskId: task.id, projectId: task.projectId });
    onOpenChange(false);
  }

  const columnLabel: Record<string, string> = {
    waiting: "Waiting",
    in_progress: "In Progress",
    testing: "Testing",
    complete: "Complete",
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New Task" : task.title}</DialogTitle>
          {task && (
            <DialogDescription>
              {columnLabel[task.column]}
              {isAgentRunning && " — agent is running"}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 pb-2">
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

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Description</label>
            {isEditable ? (
              <textarea
                className="min-h-28 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the task…"
              />
            ) : (
              <p className="whitespace-pre-wrap rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {task?.description || <em>No description</em>}
              </p>
            )}
          </div>

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
                        {err.column} — {new Date(err.occurredAt).toLocaleString()}
                      </span>
                      <p className="mt-1 text-muted-foreground">{err.message}</p>
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
        </div>

        <DialogFooter variant="bare">
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
            <Button onClick={() => void handleSave()} disabled={saving || !title.trim()}>
              {saving ? "Saving…" : isCreate ? "Create" : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
