import { useState } from "react";
import { AlertCircleIcon, GripVerticalIcon, Loader2Icon, SquareIcon } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { KanbanTask } from "@t3tools/contracts";

import { readNativeApi } from "~/nativeApi";
import { useKanbanStore } from "~/kanbanStore";
import { Button } from "~/components/ui/button";
import { KanbanTaskModal } from "./KanbanTaskModal";

interface KanbanCardProps {
  task: KanbanTask;
}

export function KanbanCard({ task }: KanbanCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const handleDomainEvent = useKanbanStore((s) => s.handleDomainEvent);

  const isAgentRunning = task.column === "in_progress" || task.column === "testing";
  const isDraggable = task.column === "waiting";
  const hasErrors = task.errorComments.length > 0 && task.column === "waiting";

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !isDraggable,
    data: { task },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
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
        className="group relative flex flex-col gap-1 rounded-xl border bg-card px-3 py-2.5 shadow-xs hover:shadow-sm cursor-pointer select-none"
        onClick={() => setModalOpen(true)}
      >
        {/* Drag handle */}
        {isDraggable && (
          <button
            type="button"
            className="absolute left-1 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-40 hover:!opacity-80 cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="size-3" />
          </button>
        )}

        <div className="flex items-start gap-2 pl-1">
          {/* Status indicator */}
          {isAgentRunning && (
            <Loader2Icon className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground/60" />
          )}
          {hasErrors && <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />}

          {/* Title */}
          <p className="flex-1 text-sm font-medium leading-snug line-clamp-2">{task.title}</p>
        </div>

        {/* Truncated description */}
        {task.description && (
          <p className="pl-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {task.description}
          </p>
        )}

        {/* Stop button */}
        {isAgentRunning && (
          <div className="mt-1 flex justify-end pl-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleStop}
            >
              <SquareIcon className="size-3" />
              Stop
            </Button>
          </div>
        )}
      </div>

      <KanbanTaskModal open={modalOpen} onOpenChange={setModalOpen} task={task} />
    </>
  );
}
