import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { ProjectId } from "@t3tools/contracts";

import { readNativeApi } from "../nativeApi";
import { useKanbanStore } from "../kanbanStore";
import { KanbanBoard, type KanbanFilters } from "../components/kanban/KanbanBoard";
import { SidebarInset } from "~/components/ui/sidebar";

function KanbanRoute() {
  const { projectId } = Route.useParams();
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const setTasks = useKanbanStore((s) => s.setTasks);
  const setConfig = useKanbanStore((s) => s.setConfig);
  const handleDomainEvent = useKanbanStore((s) => s.handleDomainEvent);

  useEffect(() => {
    const api = readNativeApi();
    if (!api) return;

    const pid = ProjectId.makeUnsafe(projectId);
    void Promise.all([
      api.kanban.listTasks({ projectId: pid }),
      api.kanban.getBoardConfig({ projectId: pid }),
    ]).then(([tasks, config]) => {
      setTasks(projectId, tasks);
      setConfig(config);
    });

    return api.kanban.onDomainEvent(handleDomainEvent);
  }, [projectId, setTasks, setConfig, handleDomainEvent]);

  const onFiltersChange = useCallback(
    (patch: Partial<KanbanFilters>) => {
      void navigate({ search: (prev) => ({ ...prev, ...patch }) });
    },
    [navigate],
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <KanbanBoard projectId={projectId} filters={filters} onFiltersChange={onFiltersChange} />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/kanban/$projectId")({
  component: KanbanRoute,
  validateSearch: (search): KanbanFilters => ({
    search: typeof search.search === "string" ? search.search : "",
    tag: typeof search.tag === "string" ? search.tag : "",
    color: typeof search.color === "string" ? search.color : "",
  }),
});
