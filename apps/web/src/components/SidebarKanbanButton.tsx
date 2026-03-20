import { Columns3Icon, KanbanIcon } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { ProjectId } from "@t3tools/contracts";

export default function SidebarKanbanButton({
  projectId,
}: {
  projectId: ProjectId;
}) {
  const navigate = useNavigate();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            data-testid="sidebar-kanban-button"
            aria-label="Open Kanban board"
            className="relative flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground/80 hover:bg-accent/40"
            onClick={() => {
              void navigate({
                to: "/kanban/$projectId",
                params: { projectId },
                search: { search: "", tag: "", color: "" },
              });
            }}
          >
            <Columns3Icon className="size-4 muted-foreground" />
            <span className="truncate">Planning</span>
          </button>
        }
      >
        <TooltipPopup side="right">Open Kanban board</TooltipPopup>
      </TooltipTrigger>
    </Tooltip>
  );
}
