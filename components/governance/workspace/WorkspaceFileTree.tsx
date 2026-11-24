"use client";

import {
  Package,
  FolderOpen,
  FilePlus2,
  FileText,
  FileCode2,
  Pencil,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Plus,
  Check,
  X,
} from "lucide-react";
import { MoveEditor } from "@/components/governance/MoveEditor";
import type { MoveModule } from "@/lib/move/project";

const ACTIVE_ROW_CLS = "bg-emerald-500/10 text-emerald-300";
const INACTIVE_ROW_CLS = "text-gray-400 hover:bg-white/5";

const ACTIVE_TAB_CLS =
  "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10";
const INACTIVE_TAB_CLS =
  "border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.08] hover:text-gray-200";

export function WorkspaceFileTree({
  t,
  name,
  modules,
  editing,
  tomlOverride,
  effectiveToml,
  adding,
  newPath,
  renaming,
  renameValue,
  target,
  onAddingChange,
  onNewPathChange,
  onAddModule,
  onSelectToml,
  onRegenerateToml,
  onSelectModule,
  onStartRename,
  onRenameValueChange,
  onCommitRename,
  onCancelRename,
  onRemoveModule,
  onEditorUpdate,
  tomlCheck,
}: {
  t: any;
  name: string;
  modules: MoveModule[];
  editing: { kind: "toml" } | { kind: "module"; index: number };
  tomlOverride: string | null;
  effectiveToml: string;
  adding: boolean;
  newPath: string;
  renaming: number | null;
  renameValue: string;
  target?: string;
  onAddingChange: (v: boolean | ((prev: boolean) => boolean)) => void;
  onNewPathChange: (v: string) => void;
  onAddModule: () => void;
  onSelectToml: () => void;
  onRegenerateToml: () => void;
  onSelectModule: (index: number) => void;
  onStartRename: (index: number, path: string) => void;
  onRenameValueChange: (v: string) => void;
  onCommitRename: (index: number, val: string) => void;
  onCancelRename: () => void;
  onRemoveModule: (index: number) => void;
  onEditorUpdate: (val: string) => void;
  tomlCheck?: any;
}) {
  const current = editing.kind === "module" ? modules[editing.index] : null;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/40">
      {/* ─────────────────────────────────────────────────────────────
          MOBILE VIEW (< md): Horizontal scrollable tabs + quick actions
          ───────────────────────────────────────────────────────────── */}
      <div className="block md:hidden border-b border-white/10 bg-black/60">
        {/* Project Header on Mobile */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 text-gray-400">
            <Package className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-semibold text-gray-200">{name}</span>
          </div>
          <button
            type="button"
            onClick={() => onAddingChange((v) => !v)}
            className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200 hover:bg-emerald-500/30 transition-colors"
          >
            <Plus className="h-3 w-3" />
            <span>{t("workspaceAddModule")}</span>
          </button>
        </div>

        {/* Scrollable File Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto px-2 py-2 no-scrollbar font-mono text-[11px]">
          {/* Move.toml Tab */}
          <button
            type="button"
            onClick={onSelectToml}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              editing.kind === "toml" ? ACTIVE_TAB_CLS : INACTIVE_TAB_CLS
            }`}
          >
            <FileText className="h-3.5 w-3.5 text-amber-400" />
            <span>Move.toml</span>
            {tomlOverride === null ? (
              <span className="text-[9px] uppercase tracking-wider text-gray-500">
                {t("workspaceGenerated")}
              </span>
            ) : (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onRegenerateToml();
                }}
                title={t("workspaceRegenerateToml")}
                className="ml-1 text-[9px] text-emerald-300 underline"
              >
                reset
              </span>
            )}
          </button>

          {/* Module Files Tabs */}
          {modules.map((m, i) => {
            const isSelected = editing.kind === "module" && editing.index === i;
            const shortName = m.path.replace(/^sources\//, "");

            return (
              <div
                key={m.path}
                className={`flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  isSelected ? ACTIVE_TAB_CLS : INACTIVE_TAB_CLS
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectModule(i)}
                  className="flex items-center gap-1.5"
                >
                  <FileCode2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="truncate max-w-[120px]">{shortName}</span>
                </button>

                {/* Inline Actions on Active Mobile Tab */}
                {isSelected && (
                  <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-white/10">
                    <button
                      type="button"
                      onClick={() => onStartRename(i, m.path)}
                      title={t("workspaceRename")}
                      className="rounded p-0.5 text-gray-400 hover:text-white"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {modules.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveModule(i)}
                        title={t("workspaceDelete")}
                        className="rounded p-0.5 text-gray-400 hover:text-rose-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Mobile Inline Add File Form */}
        {adding && (
          <div className="flex items-center gap-1.5 p-2 bg-emerald-950/30 border-t border-emerald-500/20">
            <span className="text-[10px] text-emerald-300 font-mono shrink-0">sources/</span>
            <input
              autoFocus
              placeholder="module.move"
              value={newPath}
              onChange={(e) => onNewPathChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onAddModule();
                if (e.key === "Escape") onAddingChange(false);
              }}
              className="min-w-0 flex-1 rounded border border-emerald-500/40 bg-black/60 px-2 py-1 font-mono text-xs text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={onAddModule}
              className="rounded bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white shrink-0"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => onAddingChange(false)}
              className="rounded p-1 text-gray-400 hover:text-white shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Mobile Inline Rename Form */}
        {renaming !== null && (
          <div className="flex items-center gap-1.5 p-2 bg-emerald-950/30 border-t border-emerald-500/20">
            <span className="text-[10px] text-emerald-300 font-mono shrink-0">Rename:</span>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitRename(renaming, renameValue);
                if (e.key === "Escape") onCancelRename();
              }}
              className="min-w-0 flex-1 rounded border border-emerald-500/40 bg-black/60 px-2 py-1 font-mono text-xs text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => onCommitRename(renaming, renameValue)}
              className="rounded bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white shrink-0"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onCancelRename}
              className="rounded p-1 text-gray-400 hover:text-white shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          DESKTOP VIEW (>= md): Classic IDE Sidebar + Editor
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row min-h-[350px] sm:min-h-[440px] h-[380px] sm:h-[500px]">
        {/* Left Tree Explorer (Desktop) */}
        <ul className="hidden md:block w-52 shrink-0 border-r border-white/10 bg-black/30 py-1 font-mono text-[11px] overflow-y-auto">
          <li className="flex items-center gap-1.5 px-2 py-1 text-gray-500">
            <Package className="h-3 w-3 shrink-0 text-gray-600" />
            <span className="truncate">{name}</span>
          </li>
          <li className="flex items-center gap-1.5 px-2 py-1 text-gray-500">
            <FolderOpen className="h-3 w-3 shrink-0 text-gray-600" />
            <span className="truncate">sources/</span>
            <button
              type="button"
              onClick={() => onAddingChange((v) => !v)}
              aria-label={t("workspaceAddModule")}
              className="ml-auto shrink-0 rounded p-0.5 text-gray-600 transition-colors hover:bg-white/5 hover:text-gray-200"
            >
              <FilePlus2 className="h-3 w-3" />
            </button>
          </li>
          <li
            className={`flex items-center gap-1.5 px-2 py-1 text-left transition-colors ${
              editing.kind === "toml" ? ACTIVE_ROW_CLS : INACTIVE_ROW_CLS
            }`}
          >
            <button
              type="button"
              onClick={onSelectToml}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              <FileText className="h-3 w-3 shrink-0 text-amber-400" />
              <span className="truncate">Move.toml</span>
            </button>
            {tomlOverride === null ? (
              <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wider text-gray-700">
                {t("workspaceGenerated")}
              </span>
            ) : (
              <button
                type="button"
                onClick={onRegenerateToml}
                aria-label={t("workspaceRegenerateToml")}
                title={t("workspaceRegenerateToml")}
                className="ml-auto shrink-0 rounded p-0.5 text-gray-600 transition-colors hover:bg-white/5 hover:text-emerald-300"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </li>

          {modules.map((m, i) => (
            <li key={m.path} className="pl-4">
              {renaming === i ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => onRenameValueChange(e.target.value)}
                  onBlur={() => onCommitRename(i, renameValue)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onCommitRename(i, renameValue);
                    if (e.key === "Escape") onCancelRename();
                  }}
                  aria-label={t("workspaceRename")}
                  spellCheck={false}
                  className="my-0.5 w-full rounded border border-cyan-300/40 bg-black/60 px-1.5 py-1 font-mono text-[11px] text-white focus:outline-none"
                />
              ) : (
                <div
                  className={`group flex items-center gap-1.5 py-1 pl-1 pr-1.5 text-left transition-colors ${
                    editing.kind === "module" && editing.index === i ? ACTIVE_ROW_CLS : INACTIVE_ROW_CLS
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectModule(i)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <FileCode2 className="h-3 w-3 shrink-0 text-emerald-400" />
                    <span className="truncate">{m.path.replace(/^sources\//, "")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartRename(i, m.path)}
                    aria-label={t("workspaceRename")}
                    className="shrink-0 rounded p-0.5 text-gray-700 opacity-0 transition-opacity hover:text-gray-300 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  {modules.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoveModule(i)}
                      aria-label={t("workspaceDelete")}
                      className="shrink-0 rounded p-0.5 text-gray-700 opacity-0 transition-opacity hover:text-rose-300 focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}

          {/* New Module Inline Form (Desktop) */}
          {adding && (
            <li className="pl-4 pr-2 py-1">
              <div className="flex gap-1 items-center">
                <input
                  autoFocus
                  placeholder="module.move"
                  value={newPath}
                  onChange={(e) => onNewPathChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onAddModule();
                    if (e.key === "Escape") onAddingChange(false);
                  }}
                  className="w-full rounded border border-emerald-400/40 bg-black/60 px-1.5 py-1 font-mono text-[11px] text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={onAddModule}
                  className="px-1.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[10px] text-white font-bold"
                >
                  Add
                </button>
              </div>
            </li>
          )}
        </ul>

        {/* Right Editor Area (Full width on mobile, flex-1 on desktop) */}
        <div className="min-w-0 flex-1 h-full flex flex-col bg-[#0a0a0a]">
          {editing.kind === "toml" ? (
            <MoveEditor
              value={effectiveToml}
              onChange={onEditorUpdate}
              path="Move.toml"
              className="h-full w-full"
            />
          ) : current ? (
            <MoveEditor
              value={current.source}
              onChange={onEditorUpdate}
              path={current.path}
              className="h-full w-full"
            />
          ) : (
            <div className="p-3 text-[11px] text-gray-500">{t("workspaceNoFile")}</div>
          )}
        </div>
      </div>

      {/* Manifest Diagnostics */}
      {tomlCheck && (tomlCheck.errors.length > 0 || tomlCheck.warnings.length > 0) && (
        <div className="space-y-2 border-t border-white/10 px-3 py-2.5">
          {tomlCheck.errors.length > 0 && (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2.5">
              <p className="flex items-center gap-2 text-[11px] font-bold text-rose-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {t("workspaceTomlBrokenTitle")}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-rose-100/80">
                {t("workspaceTomlBrokenHint", { address: target ?? "" })}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {tomlCheck.errors.map((e: string) => (
                  <li key={e} className="font-mono text-[10px] text-rose-200/90 break-all">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tomlCheck.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2.5">
              <p className="flex items-center gap-2 text-[11px] font-bold text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {t("workspaceTomlWarnTitle")}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-amber-100/80">{t("workspaceTomlWarnHint")}</p>
              <ul className="mt-1.5 space-y-0.5">
                {tomlCheck.warnings.map((w: string) => (
                  <li key={w} className="font-mono text-[10px] text-amber-200/90 break-all">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
