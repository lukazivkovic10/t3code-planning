import { useState } from "react";
import { AlertCircleIcon, Loader2Icon, SquareIcon } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { KanbanTask } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import { useKanbanStore } from "~/kanbanStore";
import { Button } from "~/components/ui/button";
import { KanbanTaskModal } from "./KanbanTaskModal";
import { parseDescription, TASK_TYPE_CONFIG } from "./kanbanTaskUtils";

interface KanbanCardProps {
  task: KanbanTask;
}

export function KanbanCard({ task }: KanbanCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const handleDomainEvent = useKanbanStore((s) => s.handleDomainEvent);

  const parsed = parseDescription(task.description ?? "");
  const typeConfig = TASK_TYPE_CONFIG[parsed.type];
  const TypeIcon = typeConfig.icon;

  const isAgentRunning =
    task.column === "in_progress" ||
    task.column === "testing" ||
    (task.column === "planning" && task.linkedThreadId !== null);
  const isDraggable = task.column === "waiting" || task.column === "planning";
  const hasErrors = task.errorComments.length > 0 && task.column === "waiting";
  const hasTodos = task.todos.length > 0 && task.column === "planning";
  const acceptedTodoCount = task.todos.filter((t) => t.accepted).length;

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      disabled: !isDraggable,
      data: { task },
    });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  async function handleStop(e: React.MouseEvent) {
    e.stopPropagation();
    const api = readNativeApi();
    if (!api) return;
    const updated = await api.kanban.stopTask({ taskId: task.id });
    handleDomainEvent({ type: "task.moved", task: updated });
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "group relative flex flex-col gap-1 rounded-xl border bg-card px-3 py-2.5 shadow-xs hover:shadow-sm select-none",
          isDraggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        )}
        onClick={() => setModalOpen(true)}
        {...(isDraggable ? { ...attributes, ...listeners } : {})}
      >
        <div className="flex items-start gap-2">
          {/* Status indicator */}
          {isAgentRunning && (
            <Loader2Icon className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground/60" />
          )}
          {hasErrors && (
            <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          )}

          {/* Title */}
          <p className="flex-1 text-sm font-medium leading-snug line-clamp-2">
            {task.title}
          </p>

          {/* Type badge + todo badge */}
          <div className="flex items-center gap-1.5">
            <div
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${typeConfig.className}`}
            >
              <TypeIcon className="size-3" />
              {typeConfig.label}
            </div>
            {hasTodos && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {acceptedTodoCount}/{task.todos.length}
              </span>
            )}
          </div>
        </div>

        {/* Truncated description */}
        {parsed.detail && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {parsed.detail}
          </p>
        )}

        {/* Stop button */}
        <div className="mt-0.5 flex items-center justify-between">
          {isAgentRunning && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleStop}
            >
              <SquareIcon className="size-3" />
              Stop
            </Button>
          )}
        </div>
      </div>

      <KanbanTaskModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        task={task}
      />
    </>
  );
}
