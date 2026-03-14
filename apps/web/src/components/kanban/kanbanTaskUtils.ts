import {
  SparklesIcon,
  BugIcon,
  WrenchIcon,
  TagIcon,
  StarIcon,
  FlameIcon,
  ZapIcon,
  Code2Icon,
  DatabaseIcon,
  ShieldIcon,
  GlobeIcon,
  LayersIcon,
  BookOpenIcon,
  PackageIcon,
  HeartIcon,
  CpuIcon,
  TerminalIcon,
  CloudIcon,
  LockIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TaskType = "feature" | "bugfix" | "refactor" | "other";

export const TASK_TYPE_CONFIG: Record<
  TaskType,
  { label: string; icon: LucideIcon; className: string }
> = {
  feature: {
    label: "Feature",
    icon: SparklesIcon,
    className:
      "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/60",
  },
  bugfix: {
    label: "Bug Fix",
    icon: BugIcon,
    className:
      "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/60",
  },
  refactor: {
    label: "Refactor",
    icon: WrenchIcon,
    className:
      "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/60",
  },
  other: {
    label: "Other",
    icon: TagIcon,
    className: "text-muted-foreground border-border bg-muted/40",
  },
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
  const acceptanceMatch =
    /^## Acceptance Criteria\n([\s\S]*?)(?=\n\n## |$)/m.exec(description);
  const hintsMatch = /^## Technical Notes\n([\s\S]*?)(?=\n\n## |$)/m.exec(
    description,
  );

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

// ── Card color options ────────────────────────────────────────────────────

export const TASK_COLORS = [
  {
    key: "red",
    swatch: "#f87171",
    borderClass: "border-red-400/30 dark:border-red-500/30",
  },
  {
    key: "orange",
    swatch: "#fb923c",
    borderClass: "border-orange-400/30 dark:border-orange-500/30",
  },
  {
    key: "amber",
    swatch: "#fbbf24",
    borderClass: "border-amber-400/30 dark:border-amber-500/30",
  },
  {
    key: "green",
    swatch: "#4ade80",
    borderClass: "border-green-400/30 dark:border-green-500/30",
  },
  {
    key: "teal",
    swatch: "#2dd4bf",
    borderClass: "border-teal-400/30 dark:border-teal-500/30",
  },
  {
    key: "blue",
    swatch: "#60a5fa",
    borderClass: "border-blue-400/30 dark:border-blue-500/30",
  },
  {
    key: "violet",
    swatch: "#a78bfa",
    borderClass: "border-violet-400/30 dark:border-violet-500/30",
  },
  {
    key: "pink",
    swatch: "#f472b6",
    borderClass: "border-pink-400/30 dark:border-pink-500/30",
  },
] as const;

export type TaskColor = (typeof TASK_COLORS)[number]["key"];

export function getTaskBorderClass(color: string | null): string {
  if (!color) return "";
  return TASK_COLORS.find((c) => c.key === color)?.borderClass ?? "";
}

export function getTaskSwatchColor(color: string | null): string | undefined {
  if (!color) return undefined;
  return TASK_COLORS.find((c) => c.key === color)?.swatch;
}

// ── Card icon options ─────────────────────────────────────────────────────

export const TASK_ICONS = [
  { key: "star", Icon: StarIcon },
  { key: "flame", Icon: FlameIcon },
  { key: "zap", Icon: ZapIcon },
  { key: "code", Icon: Code2Icon },
  { key: "database", Icon: DatabaseIcon },
  { key: "shield", Icon: ShieldIcon },
  { key: "globe", Icon: GlobeIcon },
  { key: "layers", Icon: LayersIcon },
  { key: "book", Icon: BookOpenIcon },
  { key: "package", Icon: PackageIcon },
  { key: "heart", Icon: HeartIcon },
  { key: "cpu", Icon: CpuIcon },
  { key: "terminal", Icon: TerminalIcon },
  { key: "cloud", Icon: CloudIcon },
  { key: "lock", Icon: LockIcon },
] as const;

export type TaskIconKey = (typeof TASK_ICONS)[number]["key"];

export function getTaskIcon(iconKey: string | null): LucideIcon | null {
  if (!iconKey) return null;
  return (TASK_ICONS.find((i) => i.key === iconKey)?.Icon ??
    null) as LucideIcon | null;
}

export function compileDescription(
  type: TaskType,
  detail: string,
  acceptance: string,
  hints: string,
): string {
  const parts = [
    `Type: ${type}`,
    `## Goal\n${detail}`,
    `## Acceptance Criteria\n${acceptance}`,
  ];
  if (hints.trim()) parts.push(`## Technical Notes\n${hints.trim()}`);
  return parts.join("\n\n");
}
