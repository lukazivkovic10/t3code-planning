import { useState } from "react";
import { SettingsIcon } from "lucide-react";
import type { KanbanBoardConfig } from "@t3tools/contracts";

import { readNativeApi } from "~/nativeApi";
import { useKanbanStore } from "~/kanbanStore";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";

interface KanbanBoardSettingsProps {
  config: KanbanBoardConfig;
}

export function KanbanBoardSettings({ config }: KanbanBoardSettingsProps) {
  const [open, setOpen] = useState(false);
  const [inProgressPrompt, setInProgressPrompt] = useState(config.inProgressPrompt);
  const [testingPrompt, setTestingPrompt] = useState(config.testingPrompt);
  const [saving, setSaving] = useState(false);
  const setConfig = useKanbanStore((s) => s.setConfig);

  function handleOpen() {
    setInProgressPrompt(config.inProgressPrompt);
    setTestingPrompt(config.testingPrompt);
    setOpen(true);
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
      });
      setConfig(updated);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size="icon" variant="ghost" onClick={handleOpen} title="Board settings">
        <SettingsIcon className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Board Settings</DialogTitle>
            <DialogDescription>
              Customize the system prompts for agent-driven columns.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5 px-6 pb-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">In Progress — Agent Prompt</label>
              <textarea
                className="min-h-32 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={inProgressPrompt}
                onChange={(e) => setInProgressPrompt(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Testing — Agent Prompt</label>
              <textarea
                className="min-h-32 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={testingPrompt}
                onChange={(e) => setTestingPrompt(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
