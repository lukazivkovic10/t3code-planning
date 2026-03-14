import { useState } from "react";
import { SettingsIcon } from "lucide-react";
import {
  KANBAN_DEFAULT_PLANNING_PROMPT,
  type KanbanBoardConfig,
  type KanbanTask,
  type ProjectId,
} from "@t3tools/contracts";

import { readNativeApi } from "~/nativeApi";
import { useKanbanStore } from "~/kanbanStore";
import { toastManager } from "~/components/ui/toast";
import { Button } from "~/components/ui/button";
import ChatMarkdown from "~/components/ChatMarkdown";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import { Switch } from "~/components/ui/switch";

interface KanbanBoardSettingsProps {
  config: KanbanBoardConfig;
  projectId: ProjectId;
  workspaceRoot: string | undefined;
  tasks: KanbanTask[];
}

type Tab = "planning" | "in_progress" | "testing" | "project_files";

const TABS: { id: Tab; label: string }[] = [
  { id: "project_files", label: "Project Files" },
  { id: "planning", label: "Planning" },
  { id: "in_progress", label: "In Progress" },
  { id: "testing", label: "Testing" },
];

type FileState = {
  content: string;
  loading: boolean;
  saving: boolean;
  loaded: boolean;
  exists: boolean;
  error: string | null;
  viewMode: "edit" | "preview";
  dirty: boolean;
};

const INITIAL_FILE_STATE: FileState = {
  content: "",
  loading: false,
  saving: false,
  loaded: false,
  exists: false,
  error: null,
  viewMode: "preview",
  dirty: false,
};

export function KanbanBoardSettings({
  config,
  projectId,
  workspaceRoot,
  tasks,
}: KanbanBoardSettingsProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("planning");
  const [inProgressPrompt, setInProgressPrompt] = useState(
    config.inProgressPrompt,
  );
  const [testingPrompt, setTestingPrompt] = useState(config.testingPrompt);
  const [planningPrompt, setPlanningPrompt] = useState(
    config.planningPrompt ?? KANBAN_DEFAULT_PLANNING_PROMPT,
  );
  const [requirePlanningApproval, setRequirePlanningApproval] = useState(
    config.requirePlanningApproval ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [agentsMd, setAgentsMd] = useState<FileState>(INITIAL_FILE_STATE);
  const [claudeMd, setClaudeMd] = useState<FileState>(INITIAL_FILE_STATE);
  const setConfig = useKanbanStore((s) => s.setConfig);

  function handleOpen() {
    setInProgressPrompt(config.inProgressPrompt);
    setTestingPrompt(config.testingPrompt);
    setPlanningPrompt(config.planningPrompt ?? KANBAN_DEFAULT_PLANNING_PROMPT);
    setRequirePlanningApproval(config.requirePlanningApproval ?? false);
    setActiveTab("planning");
    setAgentsMd(INITIAL_FILE_STATE);
    setClaudeMd(INITIAL_FILE_STATE);
    setOpen(true);
  }

  async function loadProjectFiles() {
    const api = readNativeApi();
    if (!api || !workspaceRoot) return;
    setAgentsMd((s) => ({ ...s, loading: true, error: null }));
    setClaudeMd((s) => ({ ...s, loading: true, error: null }));

    const readOne = async (relativePath: string) => {
      try {
        const result = await api.projects.readFile({ cwd: workspaceRoot, relativePath });
        return { contents: result.contents, error: null };
      } catch (err) {
        return { contents: null, error: err instanceof Error ? err.message : String(err) };
      }
    };

    const [agents, claude] = await Promise.all([
      readOne("AGENTS.md"),
      readOne("CLAUDE.md"),
    ]);

    setAgentsMd((s) => ({
      content: agents.contents ?? "",
      loading: false,
      saving: false,
      loaded: agents.error === null,
      exists: agents.contents !== null,
      error: agents.error,
      viewMode: s.viewMode,
      dirty: false,
    }));
    setClaudeMd((s) => ({
      content: claude.contents ?? "",
      loading: false,
      saving: false,
      loaded: claude.error === null,
      exists: claude.contents !== null,
      error: claude.error,
      viewMode: s.viewMode,
      dirty: false,
    }));
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    if (tab === "project_files" && !agentsMd.loaded && !agentsMd.loading && !agentsMd.error) {
      void loadProjectFiles();
    }
  }

  async function handleSave() {
    const api = readNativeApi();
    if (!api) return;
    setSaving(true);
    try {
      const updated = await api.kanban.updateBoardConfig({
        projectId: config.projectId,
        inProgressPrompt,
        testingPrompt,
        planningPrompt,
        requirePlanningApproval,
      });
      setConfig(updated);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFile(
    relativePath: string,
    content: string,
    setState: React.Dispatch<React.SetStateAction<FileState>>,
  ) {
    const api = readNativeApi();
    if (!api || !workspaceRoot) return;
    setState((s) => ({ ...s, saving: true }));
    try {
      await api.projects.writeFile({
        cwd: workspaceRoot,
        relativePath,
        contents: content,
      });
      setState((s) => ({ ...s, exists: true, dirty: false }));
      toastManager.add({ type: "success", title: `${relativePath} saved` });
    } finally {
      setState((s) => ({ ...s, saving: false }));
    }
  }

  async function handleGenerateWithAI(
    fileName: "AGENTS.md" | "CLAUDE.md",
    currentContent: string,
  ) {
    const api = readNativeApi();
    if (!api) return;

    const isAgents = fileName === "AGENTS.md";
    const description = isAgents
      ? `Create or update the AGENTS.md file in the project root.\n\nAGENTS.md provides instructions for AI agents working in this repository. It should include:\n- Project overview and purpose\n- Technology stack and key dependencies\n- Development workflow and conventions\n- Testing approach\n- Important patterns or constraints\n\n${currentContent ? `Current content:\n${currentContent}` : "The file does not exist yet — create it from scratch."}\n\nWrite the complete file and save it to AGENTS.md in the workspace root.`
      : `Create or update the CLAUDE.md file in the project root.\n\nCLAUDE.md provides project-specific instructions for Claude. It should include coding conventions, preferred patterns, important constraints, and anything Claude should know when working in this codebase.\n\n${currentContent ? `Current content:\n${currentContent}` : "The file does not exist yet — create it from scratch."}\n\nWrite the complete file and save it to CLAUDE.md in the workspace root.`;

    const task = await api.kanban.createTask({
      projectId,
      title: `Write ${fileName}`,
      description,
    });

    const inProgressTasks = tasks.filter((t) => t.column === "in_progress");
    const lastSortOrder = inProgressTasks.at(-1)?.sortOrder ?? 0;

    await api.kanban.moveTask({
      taskId: task.id,
      column: "in_progress",
      sortOrder: lastSortOrder + 1,
    });

    setOpen(false);
    toastManager.add({ type: "success", title: `AI is writing ${fileName}…` });
  }

  return (
    <>
      <Button
        size="xs"
        variant="outline"
        onClick={handleOpen}
        title="Board settings"
      >
        <SettingsIcon className="size-3.5" />
        <span className="ml-1">Board settings</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Board Settings</DialogTitle>
            <DialogDescription>
              Customize the agent prompts and behaviour for each column.
            </DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-1 border-b px-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-4 px-6 py-4">
            {activeTab === "planning" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Agent Prompt</label>
                  <p className="text-xs text-muted-foreground">
                    Instructions given to the AI when a task enters the Planning
                    column.
                  </p>
                  <textarea
                    className="mt-1 min-h-40 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={planningPrompt}
                    onChange={(e) => setPlanningPrompt(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      Require approval before In Progress
                    </span>
                    <span className="text-xs text-muted-foreground">
                      At least one todo must be accepted before the task can
                      move forward.
                    </span>
                  </div>
                  <Switch
                    checked={requirePlanningApproval}
                    onCheckedChange={setRequirePlanningApproval}
                  />
                </div>
              </>
            )}

            {activeTab === "in_progress" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Agent Prompt</label>
                <p className="text-xs text-muted-foreground">
                  Instructions given to the AI when a task enters the In
                  Progress column.
                </p>
                <textarea
                  className="mt-1 min-h-40 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={inProgressPrompt}
                  onChange={(e) => setInProgressPrompt(e.target.value)}
                />
              </div>
            )}

            {activeTab === "testing" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Agent Prompt</label>
                <p className="text-xs text-muted-foreground">
                  Instructions given to the AI when a task enters the Testing
                  column.
                </p>
                <textarea
                  className="mt-1 min-h-40 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={testingPrompt}
                  onChange={(e) => setTestingPrompt(e.target.value)}
                />
              </div>
            )}

            {activeTab === "project_files" && (
              <div className="flex flex-col gap-6">
                {!workspaceRoot ? (
                  <p className="text-sm text-muted-foreground">
                    Workspace root is not set for this project.
                  </p>
                ) : (
                  <>
                    {(
                      [
                        {
                          name: "AGENTS.md" as const,
                          state: agentsMd,
                          setState: setAgentsMd,
                        },
                        {
                          name: "CLAUDE.md" as const,
                          state: claudeMd,
                          setState: setClaudeMd,
                        },
                      ] as const
                    ).map(({ name, state, setState }) => (
                      <div key={name} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">{name}</label>
                          <div className="flex items-center gap-2">
                            {state.loaded && state.exists && (
                              <div className="flex overflow-hidden rounded-md border text-xs">
                                <button
                                  onClick={() => setState((s) => ({ ...s, viewMode: "edit" }))}
                                  className={`px-2 py-1 ${state.viewMode === "edit" ? "bg-muted font-medium" : "text-muted-foreground"}`}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => setState((s) => ({ ...s, viewMode: "preview" }))}
                                  className={`px-2 py-1 ${state.viewMode === "preview" ? "bg-muted font-medium" : "text-muted-foreground"}`}
                                >
                                  Preview
                                </button>
                              </div>
                            )}
                            {(!state.loaded || state.exists) && !state.error && state.dirty && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={state.loading || state.saving}
                                onClick={() =>
                                  void handleSaveFile(
                                    name,
                                    state.content,
                                    setState,
                                  )
                                }
                              >
                                {state.saving ? "Saving…" : "Save"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={state.loading}
                              onClick={() =>
                                void handleGenerateWithAI(name, state.content)
                              }
                            >
                              Generate with AI
                            </Button>
                          </div>
                        </div>
                        {state.error !== null ? (
                          <div className="mt-1 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center">
                            <p className="text-sm text-muted-foreground">
                              Failed to load {name}.
                            </p>
                            <p className="max-w-sm break-all font-mono text-xs text-muted-foreground">
                              {state.error}
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void loadProjectFiles()}
                            >
                              Retry
                            </Button>
                          </div>
                        ) : state.loaded && !state.exists ? (
                          <div className="mt-1 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center">
                            <p className="text-sm text-muted-foreground">
                              This file doesn&apos;t exist yet.
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {workspaceRoot}/{name}
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setState((s) => ({ ...s, exists: true, dirty: true, viewMode: "edit" }))
                              }
                            >
                              Create {name}
                            </Button>
                          </div>
                        ) : state.viewMode === "preview" ? (
                          <div className="mt-1 max-h-96 min-h-48 overflow-y-auto rounded-lg border bg-background px-3 py-2">
                            <ChatMarkdown text={state.content} cwd={workspaceRoot} />
                          </div>
                        ) : (
                          <textarea
                            className="mt-1 min-h-48 w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                            value={state.loading ? "" : state.content}
                            placeholder={
                              state.loading ? "Loading…" : `${name} content`
                            }
                            disabled={state.loading}
                            onChange={(e) =>
                              setState((s) => ({
                                ...s,
                                content: e.target.value,
                                dirty: true,
                              }))
                            }
                          />
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {activeTab !== "project_files" && (
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          )}
        </DialogPopup>
      </Dialog>
    </>
  );
}
