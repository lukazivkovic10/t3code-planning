import { type DragEndEvent, DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  KANBAN_DEFAULT_IN_PROGRESS_PROMPT,
  KANBAN_DEFAULT_PLANNING_PROMPT,
  KANBAN_DEFAULT_TESTING_PROMPT,
  KanbanTaskId,
  ProjectId,
  type KanbanBoardConfig,
  type KanbanColumnId,
  type KanbanTask,
} from "@t3tools/contracts";
import { toastManager } from "~/components/ui/toast";

import { readNativeApi } from "~/nativeApi";
import { useKanbanStore } from "~/kanbanStore";
import { useStore } from "~/store";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanBoardSettings } from "./KanbanBoardSettings";

const COLUMNS: KanbanColumnId[] = ["waiting", "planning", "in_progress", "testing", "complete"];

interface KanbanBoardProps {
  projectId: string;
}

export function KanbanBoard({ projectId }: KanbanBoardProps) {
  const tasksByProject = useKanbanStore((s) => s.tasksByProject);
  const configByProject = useKanbanStore((s) => s.configByProject);
  const handleDomainEvent = useKanbanStore((s) => s.handleDomainEvent);
  const projectName = useStore((s) => s.projects.find((p) => p.id === projectId)?.name);
  const workspaceRoot = useStore((s) => s.projects.find((p) => p.id === projectId)?.cwd);

  const tasks = tasksByProject[projectId] ?? [];
  const config: KanbanBoardConfig = configByProject[projectId] ?? {
    projectId: ProjectId.makeUnsafe(projectId),
    inProgressPrompt: KANBAN_DEFAULT_IN_PROGRESS_PROMPT,
    testingPrompt: KANBAN_DEFAULT_TESTING_PROMPT,
    planningPrompt: KANBAN_DEFAULT_PLANNING_PROMPT,
    requirePlanningApproval: false,
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

    // Allowed drag moves:
    // waiting → planning OR in_progress
    // planning → in_progress
    const isAllowedMove =
      (task.column === "waiting" && (targetColumn === "planning" || targetColumn === "in_progress")) ||
      (task.column === "planning" && targetColumn === "in_progress");

    if (!isAllowedMove) return;

    // Check planning approval gate
    if (task.column === "planning" && targetColumn === "in_progress" && config.requirePlanningApproval) {
      const acceptedCount = task.todos.filter((t) => t.accepted).length;
      if (acceptedCount === 0) {
        toastManager.add({
          type: "warning",
          title: "Planning approval required — accept at least one todo before moving to In Progress.",
        });
        return;
      }
    }

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
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">Kanban Board</h2>
          {projectName && (
            <span className="text-sm text-muted-foreground">— {projectName}</span>
          )}
        </div>
        <KanbanBoardSettings config={config} projectId={ProjectId.makeUnsafe(projectId)} workspaceRoot={workspaceRoot} tasks={tasks} />
      </div>

      {/* Columns */}
      <DndContext sensors={sensors} onDragEnd={(e) => void handleDragEnd(e)}>
        <div className="flex flex-1 min-h-0 gap-3 overflow-x-auto p-4 sm:gap-4 sm:p-6">
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
