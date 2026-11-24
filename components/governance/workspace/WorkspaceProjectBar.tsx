"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ProjectSummary } from "@/lib/move/project";

export function WorkspaceProjectBar({
  t,
  projects,
  activeId,
  onSelectProject,
  onAddProject,
  onRemoveProject,
}: {
  t: (key: string) => string;
  projects: ProjectSummary[];
  activeId: string;
  onSelectProject: (id: string) => void;
  onAddProject: () => void;
  onRemoveProject: () => void;
}) {
  return (
    <div className="mb-3 flex flex-col gap-2 border-b border-white/10 pb-3 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="min-w-0 w-full sm:flex-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
          {t("workspaceProject")}
        </span>
        <select
          value={activeId}
          onChange={(e) => onSelectProject(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-[12px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id} className="bg-gray-900">
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAddProject}
          title={t("workspaceProjectNew")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-gray-300 transition-colors hover:bg-white/[0.07] hover:text-white sm:flex-none"
        >
          <Plus className="w-3.5 h-3.5" />
          {t("workspaceProjectNew")}
        </button>
        <button
          type="button"
          onClick={onRemoveProject}
          title={t("workspaceProjectDelete")}
          aria-label={t("workspaceProjectDelete")}
          className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-gray-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
