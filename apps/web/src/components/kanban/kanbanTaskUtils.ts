import { SparklesIcon, BugIcon, WrenchIcon, TagIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TaskType = "feature" | "bugfix" | "refactor" | "other";

export const TASK_TYPE_CONFIG: Record<TaskType, { label: string; icon: LucideIcon; className: string }> = {
  feature:  { label: "Feature",  icon: SparklesIcon, className: "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/60" },
  bugfix:   { label: "Bug Fix",  icon: BugIcon,      className: "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/60" },
  refactor: { label: "Refactor", icon: WrenchIcon,   className: "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/60" },
  other:    { label: "Other",    icon: TagIcon,       className: "text-muted-foreground border-border bg-muted/40" },
};

export interface ParsedDescription {
  type: TaskType;
  detail: string;
  acceptance: string;
  hints: string;
}

export function parseDescription(description: string): ParsedDescription {
  const typeMatch = /^Type: (\w+)/.exec(description);
  const goalMatch = /^## Goal\n([\s\S]*?)(?=\n\n## |$)/m.exec(description);
  const acceptanceMatch = /^## Acceptance Criteria\n([\s\S]*?)(?=\n\n## |$)/m.exec(description);
  const hintsMatch = /^## Technical Notes\n([\s\S]*?)(?=\n\n## |$)/m.exec(description);

  const validTypes: TaskType[] = ["feature", "bugfix", "refactor", "other"];
  const raw = typeMatch?.[1] as TaskType | undefined;
  const type: TaskType = raw && validTypes.includes(raw) ? raw : "feature";

  if (typeMatch ?? goalMatch ?? acceptanceMatch) {
    return {
      type,
      detail: goalMatch?.[1]?.trim() ?? "",
      acceptance: acceptanceMatch?.[1]?.trim() ?? "",
      hints: hintsMatch?.[1]?.trim() ?? "",
    };
  }
  // Plain (pre-wizard) description — put it all in detail
  return { type: "feature", detail: description, acceptance: "", hints: "" };
}

export function compileDescription(type: TaskType, detail: string, acceptance: string, hints: string): string {
  const parts = [`Type: ${type}`, `## Goal\n${detail}`, `## Acceptance Criteria\n${acceptance}`];
  if (hints.trim()) parts.push(`## Technical Notes\n${hints.trim()}`);
  return parts.join("\n\n");
}
