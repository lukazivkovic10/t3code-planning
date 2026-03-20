import { useState } from "react";
import { PlusIcon, Inbox, Calendar, Play, Bug, CheckCircle } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import type { KanbanColumnId, KanbanTask } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { KanbanCard } from "./KanbanCard";
import { KanbanTaskModal } from "./KanbanTaskModal";

const COLUMN_LABELS: Record<KanbanColumnId, string> = {
  waiting: "New",
  planning: "Planning",
  in_progress: "In Progress",
  testing: "Testing",
  complete: "Complete",
};

const COLUMN_ICONS: Record<KanbanColumnId, (props: any) => JSX.Element> = {
  waiting: Inbox,
  planning: Calendar,
  in_progress: Play,
  testing: Bug,
  complete: CheckCircle,
};

interface KanbanColumnProps {
  column: KanbanColumnId;
  tasks: KanbanTask[];
  projectId: string;
  workspaceRoot?: string;
}

export function KanbanColumn({ column, tasks, projectId, workspaceRoot }: KanbanColumnProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: column });

  const isWaiting = column === "waiting";
  const Icon = COLUMN_ICONS[column];

  return (
    <>
      <div className="flex min-w-[12rem] flex-1 flex-col gap-2 self-stretch">
        {/* Header */}
        <div className="flex items-center gap-2 px-1">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {COLUMN_LABELS[column]}
          </h3>
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {tasks.length}
          </span>
        </div>

        {/* Drop zone */}
        <div
          ref={setNodeRef}
          className={cn(
            "flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-2xl border-2 border-dashed p-2 transition-colors",
            isOver ? "border-primary/50 bg-primary/5" : "border-transparent bg-muted/30",
            isWaiting && "cursor-pointer",
          )}
          onClick={
            isWaiting
              ? (e) => {
                  if (e.target === e.currentTarget) setCreateOpen(true);
                }
              : undefined
          }
        >
          {tasks.map((task) => (
            <KanbanCard key={task.id} task={task} />
          ))}

          {tasks.length === 0 && (
            <p
              className="py-4 text-center text-xs text-muted-foreground/50"
              onClick={isWaiting ? () => setCreateOpen(true) : undefined}
            >
              {isWaiting ? "Click to add a task" : "No tasks"}
            </p>
          )}
        </div>

        {/* Add task button (waiting column only) */}
        {isWaiting && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground/70 hover:text-foreground"
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon className="size-3.5" />
            Add task
          </Button>
        )}
      </div>

      {isWaiting && (
        <KanbanTaskModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          projectId={projectId}
          workspaceRoot={workspaceRoot}
        />
      )}
    </>
  );
}
