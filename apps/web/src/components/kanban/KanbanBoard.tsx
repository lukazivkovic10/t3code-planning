import { useEffect, useRef, useState } from "react";
import {
  type DragEndEvent,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
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
import { AlertTriangleIcon, SearchIcon, XIcon } from "lucide-react";
import { toastManager } from "~/components/ui/toast";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { cn } from "~/lib/utils";
import { TASK_COLORS } from "./kanbanTaskUtils";

import { readNativeApi } from "~/nativeApi";
import { useKanbanStore } from "~/kanbanStore";
import { useStore } from "~/store";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanBoardSettings } from "./KanbanBoardSettings";
import { KanbanTaskModal } from "./KanbanTaskModal";

const COLUMNS: KanbanColumnId[] = [
  "waiting",
  "planning",
  "in_progress",
  "testing",
  "complete",
];

export interface KanbanFilters {
  search: string;
  tag: string;
  color: string;
}

interface KanbanBoardProps {
  projectId: string;
  filters: KanbanFilters;
  onFiltersChange: (patch: Partial<KanbanFilters>) => void;
}

export function KanbanBoard({
  projectId,
  filters,
  onFiltersChange,
}: KanbanBoardProps) {
  const tasksByProject = useKanbanStore((s) => s.tasksByProject);
  const configByProject = useKanbanStore((s) => s.configByProject);
  const handleDomainEvent = useKanbanStore((s) => s.handleDomainEvent);
  const projectName = useStore(
    (s) => s.projects.find((p) => p.id === projectId)?.name,
  );
  const workspaceRoot = useStore(
    (s) => s.projects.find((p) => p.id === projectId)?.cwd,
  );

  const codexAuthError = useStore(
    (s) =>
      s.threads.find(
        (t) =>
          t.projectId === projectId && t.error?.includes("not authenticated"),
      )?.error ?? null,
  );

  const tasks = tasksByProject[projectId] ?? [];
  const config: KanbanBoardConfig = configByProject[projectId] ?? {
    projectId: ProjectId.makeUnsafe(projectId),
    inProgressPrompt: KANBAN_DEFAULT_IN_PROGRESS_PROMPT,
    testingPrompt: KANBAN_DEFAULT_TESTING_PROMPT,
    planningPrompt: KANBAN_DEFAULT_PLANNING_PROMPT,
    requirePlanningApproval: false,
    updatedAt: new Date().toISOString(),
  };

  // Local draft for the search input — debounced into URL
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const onFiltersChangeRef = useRef(onFiltersChange);
  onFiltersChangeRef.current = onFiltersChange;

  // Sync searchDraft when URL changes externally (back/forward navigation)
  const prevUrlSearch = useRef(filters.search);
  useEffect(() => {
    if (filters.search !== prevUrlSearch.current) {
      prevUrlSearch.current = filters.search;
      setSearchDraft(filters.search);
    }
  }, [filters.search]);

  // Debounce search draft → URL
  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = setTimeout(() => {
      onFiltersChangeRef.current({ search: searchDraft });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  // Unique tags derived from all tasks in this project
  const availableTags = [
    ...new Set(tasks.flatMap((t) => (t.tag ? [t.tag] : []))),
  ].toSorted();

  const hasActiveFilters =
    searchDraft !== "" || filters.tag !== "" || filters.color !== "";

  function clearFilters() {
    setSearchDraft("");
    onFiltersChange({ search: "", tag: "", color: "" });
  }

  // Shortcut state: open/close New Task modal
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);

  // Global keyboard handler: Ctrl/Cmd + T opens create-task modal.
  // Ignore when focus is in an editable element (input/textarea/contenteditable).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // check modifier (ctrl for Windows/Linux, meta for macOS)
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== "t") return;

      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName;
        const isEditable =
          active.isContentEditable ||
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          (active.getAttribute && active.getAttribute("role") === "textbox");
        if (isEditable) {
          // Don't hijack typing inside forms or editors
          return;
        }
      }

      // Prevent default browser action (new tab). Note: browser behavior may differ.
      e.preventDefault();
      setIsNewTaskOpen(true);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function matchesFilters(task: KanbanTask): boolean {
    if (searchDraft) {
      const q = searchDraft.toLowerCase();
      if (
        !task.title.toLowerCase().includes(q) &&
        !task.description.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (filters.tag && task.tag !== filters.tag) return false;
    if (filters.color && task.color !== filters.color) return false;
    return true;
  }

  function getTasksByColumn(column: KanbanColumnId): KanbanTask[] {
    return tasks
      .filter((t) => t.column === column && matchesFilters(t))
      .toSorted((a, b) => a.sortOrder - b.sortOrder);
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
      (task.column === "waiting" &&
        (targetColumn === "planning" || targetColumn === "in_progress")) ||
      (task.column === "planning" && targetColumn === "in_progress");

    if (!isAllowedMove) return;

    // Block moves from New when Codex is not authenticated
    if (task.column === "waiting" && codexAuthError) {
      toastManager.add({
        type: "error",
        title: "Cannot start task — Codex is not authenticated.",
        description: 'Run "codex login" and try again.',
      });
      return;
    }

    // Check planning approval gate
    if (
      task.column === "planning" &&
      targetColumn === "in_progress" &&
      config.requirePlanningApproval
    ) {
      const acceptedCount = task.todos.filter((t) => t.accepted).length;
      if (acceptedCount === 0) {
        toastManager.add({
          type: "warning",
          title:
            "Planning approval required — accept at least one todo before moving to In Progress.",
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
      <div className="flex flex-wrap items-center gap-3 border-b px-6 py-3">
        <div className="flex items-baseline gap-2 shrink-0">
          <h2 className="text-sm font-semibold">Kanban Board</h2>
          {projectName && (
            <span className="text-sm text-muted-foreground">
              — {projectName}
            </span>
          )}
        </div>

        {/* Filter controls */}
        <div className="flex flex-1 justify-end items-center gap-2 min-w-0">
          {/* Text search */}
          <div className="relative flex h-7 max-w-52 items-center gap-1.5 rounded-lg border border-input bg-background px-2 text-foreground shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/24">
            <SearchIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
            <input
              type="search"
              placeholder="Search tasks…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
            />
          </div>

          {/* Tag filter */}
          {availableTags.length > 0 && (
            <select
              value={filters.tag}
              onChange={(e) => onFiltersChange({ tag: e.target.value })}
              className="h-7 rounded-lg border border-input bg-background px-2 text-xs text-foreground shadow-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/24"
            >
              <option value="">All tags</option>
              {availableTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}

          {/* Color filter */}
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Filter by color"
          >
            {TASK_COLORS.map(({ key, swatch }) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  onFiltersChange({ color: filters.color === key ? "" : key })
                }
                className={cn(
                  "size-3.5 rounded-full border-2 transition-transform",
                  filters.color === key
                    ? "scale-125 border-foreground/60"
                    : "border-transparent hover:scale-110",
                )}
                style={{ backgroundColor: swatch }}
                title={`Filter by ${key}`}
                aria-label={`Filter by ${key} color`}
                aria-pressed={filters.color === key}
              />
            ))}
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Clear all filters"
            >
              <XIcon className="size-3" />
              Clear
            </button>
          )}
        </div>

        <KanbanBoardSettings
          config={config}
          projectId={ProjectId.makeUnsafe(projectId)}
          workspaceRoot={workspaceRoot}
          tasks={tasks}
        />
      </div>

      {/* Codex auth error banner */}
      {codexAuthError && (
        <div className="px-6 pt-3">
          <Alert variant="error">
            <AlertTriangleIcon className="size-4" />
            <AlertTitle>Codex not authenticated</AlertTitle>
            <AlertDescription>{codexAuthError}</AlertDescription>
          </Alert>
        </div>
      )}

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

      {/* New Task modal, create mode */}
      <KanbanTaskModal
        open={isNewTaskOpen}
        onOpenChange={setIsNewTaskOpen}
        projectId={projectId}
      />
    </div>
  );
}
