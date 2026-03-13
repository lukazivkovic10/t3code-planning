import { type DragEndEvent, DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  KANBAN_DEFAULT_IN_PROGRESS_PROMPT,
  KANBAN_DEFAULT_TESTING_PROMPT,
  KanbanTaskId,
  ProjectId,
  type KanbanBoardConfig,
  type KanbanColumnId,
  type KanbanTask,
} from "@t3tools/contracts";

import { readNativeApi } from "~/nativeApi";
import { useKanbanStore } from "~/kanbanStore";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanBoardSettings } from "./KanbanBoardSettings";

const COLUMNS: KanbanColumnId[] = ["waiting", "in_progress", "testing", "complete"];

interface KanbanBoardProps {
  projectId: string;
}

export function KanbanBoard({ projectId }: KanbanBoardProps) {
  const tasksByProject = useKanbanStore((s) => s.tasksByProject);
  const configByProject = useKanbanStore((s) => s.configByProject);
  const handleDomainEvent = useKanbanStore((s) => s.handleDomainEvent);

  const tasks = tasksByProject[projectId] ?? [];
  const config: KanbanBoardConfig = configByProject[projectId] ?? {
    projectId: ProjectId.makeUnsafe(projectId),
    inProgressPrompt: KANBAN_DEFAULT_IN_PROGRESS_PROMPT,
    testingPrompt: KANBAN_DEFAULT_TESTING_PROMPT,
    updatedAt: new Date().toISOString(),
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function getTasksByColumn(column: KanbanColumnId): KanbanTask[] {
    return tasks.filter((t) => t.column === column).toSorted((a, b) => a.sortOrder - b.sortOrder);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const taskId = KanbanTaskId.makeUnsafe(String(active.id));
    const targetColumn = over.id as KanbanColumnId;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Only allow dragging from waiting to in_progress
    if (task.column !== "waiting" || targetColumn !== "in_progress") return;

    const api = readNativeApi();
    if (!api) return;

    const targetTasks = getTasksByColumn(targetColumn);
    const lastTask = targetTasks.at(-1);
    const newSortOrder = lastTask ? lastTask.sortOrder + 1 : 1;

    const updated = await api.kanban.moveTask({
      taskId,
      column: targetColumn,
      sortOrder: newSortOrder,
    });
    handleDomainEvent({ type: "task.moved", task: updated });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Kanban Board</h2>
        <KanbanBoardSettings config={config} />
      </div>

      {/* Columns */}
      <DndContext sensors={sensors} onDragEnd={(e) => void handleDragEnd(e)}>
        <div className="flex flex-1 gap-4 overflow-x-auto p-6">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column}
              column={column}
              tasks={getTasksByColumn(column)}
              projectId={projectId}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
