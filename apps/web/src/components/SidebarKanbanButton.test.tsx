import { describe, it, expect } from "vitest";
import { render } from "vitest-browser-react";
import SidebarKanbanButton from "./SidebarKanbanButton";

describe("SidebarKanbanButton", () => {
  it("renders in its boards section and has aria-label", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const screen = await render(
      <div data-testid="boards-section">
        <SidebarKanbanButton projectId={"project-1" as any} />
      </div>,
      { container: host },
    );

    const boards = screen.getByTestId("boards-section");
    expect(boards).toBeTruthy();
    const button = screen.getByLabelText("Open Kanban board");
    expect(button).toBeTruthy();

    await screen.unmount();
    host.remove();
  });
});
