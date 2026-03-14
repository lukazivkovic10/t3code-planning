import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ProjectId } from "@t3tools/contracts";

import { readNativeApi } from "../nativeApi";
import { useKanbanStore } from "../kanbanStore";
import { KanbanBoard } from "../components/kanban/KanbanBoard";
import { SidebarInset } from "~/components/ui/sidebar";

function KanbanRoute() {
  const { projectId } = Route.useParams();
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

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <KanbanBoard projectId={projectId} />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/kanban/$projectId")({
  component: KanbanRoute,
});
