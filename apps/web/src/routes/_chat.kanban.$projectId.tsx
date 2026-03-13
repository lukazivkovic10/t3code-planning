import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ProjectId } from "@t3tools/contracts";

import { readNativeApi } from "../nativeApi";
import { useKanbanStore } from "../kanbanStore";
import { KanbanBoard } from "../components/kanban/KanbanBoard";

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

  return <KanbanBoard projectId={projectId} />;
}

export const Route = createFileRoute("/_chat/kanban/$projectId")({
  component: KanbanRoute,
});
