import type {
  KanbanBoardConfig,
  KanbanDomainEvent,
  KanbanTask,
  KanbanTaskId,
} from "@t3tools/contracts";
import { create } from "zustand";

interface KanbanStore {
  tasksByProject: Record<string, KanbanTask[]>;
  configByProject: Record<string, KanbanBoardConfig>;
  setTasks: (projectId: string, tasks: readonly KanbanTask[]) => void;
  setConfig: (config: KanbanBoardConfig) => void;
  handleDomainEvent: (event: KanbanDomainEvent) => void;
}

function upsertTask(tasks: KanbanTask[], task: KanbanTask): KanbanTask[] {
  const idx = tasks.findIndex((t) => t.id === task.id);
  if (idx === -1) return [...tasks, task];
  const next = [...tasks];
  next[idx] = task;
  return next;
}

function removeTask(tasks: KanbanTask[], taskId: KanbanTaskId): KanbanTask[] {
  return tasks.filter((t) => t.id !== taskId);
}

export const useKanbanStore = create<KanbanStore>((set) => ({
  tasksByProject: {},
  configByProject: {},

  setTasks: (projectId, tasks) =>
    set((state) => ({
      tasksByProject: { ...state.tasksByProject, [projectId]: [...tasks] },
    })),

  setConfig: (config) =>
    set((state) => ({
      configByProject: { ...state.configByProject, [config.projectId]: config },
    })),

  handleDomainEvent: (event) =>
    set((state) => {
      switch (event.type) {
        case "task.created":
        case "task.updated":
        case "task.moved":
        case "task.todos-updated":
        case "task.error": {
          const { task } = event;
          const existing = state.tasksByProject[task.projectId] ?? [];
          return {
            tasksByProject: {
              ...state.tasksByProject,
              [task.projectId]: upsertTask(existing, task),
            },
          };
        }
        case "task.deleted": {
          const existing = state.tasksByProject[event.projectId] ?? [];
          return {
            tasksByProject: {
              ...state.tasksByProject,
              [event.projectId]: removeTask(existing, event.taskId),
            },
          };
        }
        case "config.updated":
          return {
            configByProject: {
              ...state.configByProject,
              [event.config.projectId]: event.config,
            },
          };
        default:
          return state;
      }
    }),
}));
