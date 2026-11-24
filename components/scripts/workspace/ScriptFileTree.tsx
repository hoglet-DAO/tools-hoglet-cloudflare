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
  Plus,
  Check,
  X,
} from "lucide-react";
import { MoveEditor } from "@/components/governance/MoveEditor";
import type { ScriptFile } from "../scriptTemplates";

const ACTIVE_ROW_CLS = "bg-purple-500/10 text-purple-200";
const INACTIVE_ROW_CLS = "text-gray-400 hover:bg-white/5";

const ACTIVE_TAB_CLS =
  "bg-purple-500/20 text-purple-200 border-purple-500/40 shadow-sm shadow-purple-500/10";
const INACTIVE_TAB_CLS =
  "border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.08] hover:text-gray-200";

export function ScriptFileTree({
  projectName,
  files,
  editing,
  tomlOverride,
  effectiveToml,
  adding,
  newPath,
  renaming,
  renameValue,
  onAddingChange,
  onNewPathChange,
  onAddScript,
  onSelectToml,
  onRegenerateToml,
  onSelectScript,
  onStartRename,
  onRenameValueChange,
  onCommitRename,
  onCancelRename,
  onRemoveScript,
  onEditorUpdate,
}: {
  projectName: string;
  files: ScriptFile[];
  editing: { kind: "toml" } | { kind: "script"; index: number };
  tomlOverride: string | null;
  effectiveToml: string;
  adding: boolean;
  newPath: string;
  renaming: number | null;
  renameValue: string;
  onAddingChange: (v: boolean | ((prev: boolean) => boolean)) => void;
  onNewPathChange: (v: string) => void;
  onAddScript: () => void;
  onSelectToml: () => void;
  onRegenerateToml: () => void;
  onSelectScript: (index: number) => void;
  onStartRename: (index: number, path: string) => void;
  onRenameValueChange: (v: string) => void;
  onCommitRename: (index: number, val: string) => void;
  onCancelRename: () => void;
  onRemoveScript: (index: number) => void;
  onEditorUpdate: (val: string) => void;
}) {
  const current = editing.kind === "script" ? files[editing.index] : null;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/40">
      {/* ─────────────────────────────────────────────────────────────
          MOBILE VIEW (< md): Horizontal scrollable tabs + quick actions
          ───────────────────────────────────────────────────────────── */}
      <div className="block md:hidden border-b border-white/10 bg-black/60">
        {/* Project Header on Mobile */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 text-gray-400">
            <Package className="h-3.5 w-3.5 text-purple-400" />
            <span className="font-semibold text-gray-200">{projectName}</span>
          </div>
          <button
            type="button"
            onClick={() => onAddingChange((v) => !v)}
            className="inline-flex items-center gap-1 rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-200 hover:bg-purple-500/30 transition-colors"
          >
            <Plus className="h-3 w-3" />
            <span>New Script</span>
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
            <FileText className="h-3.5 w-3.5 text-purple-400" />
            <span>Move.toml</span>
            {tomlOverride === null ? (
              <span className="text-[9px] uppercase tracking-wider text-gray-500">def</span>
            ) : (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onRegenerateToml();
                }}
                title="Reset to default manifest"
                className="ml-1 text-[9px] text-purple-300 underline"
              >
                reset
              </span>
            )}
          </button>

          {/* Script Files Tabs */}
          {files.map((s, i) => {
            const isSelected = editing.kind === "script" && editing.index === i;
            const shortName = s.path.replace(/^scripts\//, "");

            return (
              <div
                key={s.path}
                className={`flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  isSelected ? ACTIVE_TAB_CLS : INACTIVE_TAB_CLS
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectScript(i)}
                  className="flex items-center gap-1.5"
                >
                  <FileCode2 className="h-3.5 w-3.5 text-purple-400" />
                  <span className="truncate max-w-[120px]">{shortName}</span>
                </button>

                {/* Inline Actions on Active Mobile Tab */}
                {isSelected && (
                  <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-white/10">
                    <button
                      type="button"
                      onClick={() => onStartRename(i, s.path)}
                      title="Rename script"
                      className="rounded p-0.5 text-gray-400 hover:text-white"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {files.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveScript(i)}
                        title="Delete script"
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
          <div className="flex items-center gap-1.5 p-2 bg-purple-950/30 border-t border-purple-500/20">
            <span className="text-[10px] text-purple-300 font-mono shrink-0">scripts/</span>
            <input
              autoFocus
              placeholder="my_script.move"
              value={newPath}
              onChange={(e) => onNewPathChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onAddScript();
                if (e.key === "Escape") onAddingChange(false);
              }}
              className="min-w-0 flex-1 rounded border border-purple-500/40 bg-black/60 px-2 py-1 font-mono text-xs text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={onAddScript}
              className="rounded bg-purple-600 hover:bg-purple-500 px-2.5 py-1 text-[11px] font-bold text-white shrink-0"
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
          <div className="flex items-center gap-1.5 p-2 bg-purple-950/30 border-t border-purple-500/20">
            <span className="text-[10px] text-purple-300 font-mono shrink-0">Rename:</span>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitRename(renaming, renameValue);
                if (e.key === "Escape") onCancelRename();
              }}
              className="min-w-0 flex-1 rounded border border-purple-500/40 bg-black/60 px-2 py-1 font-mono text-xs text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => onCommitRename(renaming, renameValue)}
              className="rounded bg-purple-600 hover:bg-purple-500 px-2.5 py-1 text-[11px] font-bold text-white shrink-0"
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
            <Package className="h-3 w-3 shrink-0 text-purple-400/70" />
            <span className="truncate text-gray-300 font-semibold">{projectName}</span>
          </li>

          <li className="flex items-center gap-1.5 px-2 py-1 text-gray-500">
            <FolderOpen className="h-3 w-3 shrink-0 text-purple-400" />
            <span className="truncate">scripts/</span>
            <button
              type="button"
              onClick={() => onAddingChange((v) => !v)}
              aria-label="Add script"
              title="Add script file"
              className="ml-auto shrink-0 rounded p-0.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-purple-300"
            >
              <FilePlus2 className="h-3 w-3" />
            </button>
          </li>

          {/* Move.toml Item */}
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
              <FileText className="h-3 w-3 shrink-0 text-purple-400/80" />
              <span className="truncate">Move.toml</span>
            </button>
            {tomlOverride === null ? (
              <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wider text-gray-600">
                default
              </span>
            ) : (
              <button
                type="button"
                onClick={onRegenerateToml}
                aria-label="Restore default manifest"
                title="Restore default manifest"
                className="ml-auto shrink-0 rounded p-0.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-purple-300"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </li>

          {/* Scripts List */}
          {files.map((s, i) => (
            <li key={s.path} className="pl-4">
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
                  spellCheck={false}
                  className="my-0.5 w-full rounded border border-purple-400/40 bg-black/60 px-1.5 py-1 font-mono text-[11px] text-white focus:outline-none"
                />
              ) : (
                <div
                  className={`group flex items-center gap-1.5 py-1 pl-1 pr-1.5 text-left transition-colors ${
                    editing.kind === "script" && editing.index === i ? ACTIVE_ROW_CLS : INACTIVE_ROW_CLS
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectScript(i)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <FileCode2 className="h-3 w-3 shrink-0 text-purple-400" />
                    <span className="truncate">{s.path.replace(/^scripts\//, "")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onStartRename(i, s.path)}
                    title="Rename script"
                    className="shrink-0 rounded p-0.5 text-gray-600 opacity-0 transition-opacity hover:text-gray-300 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>

                  {files.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoveScript(i)}
                      title="Delete script"
                      className="shrink-0 rounded p-0.5 text-gray-600 opacity-0 transition-opacity hover:text-rose-400 focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}

          {/* New Script Inline Form (Desktop) */}
          {adding && (
            <li className="pl-4 pr-2 py-1">
              <div className="flex gap-1 items-center">
                <input
                  autoFocus
                  placeholder="name.move"
                  value={newPath}
                  onChange={(e) => onNewPathChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onAddScript();
                    if (e.key === "Escape") onAddingChange(false);
                  }}
                  className="w-full rounded border border-purple-400/40 bg-black/60 px-1.5 py-1 font-mono text-[11px] text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={onAddScript}
                  className="px-1.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-[10px] text-white font-bold"
                >
                  Add
                </button>
              </div>
            </li>
          )}
        </ul>

        {/* Right Editor Area (Full width on mobile, flex-1 on desktop) */}
        <div className="min-w-0 flex-1 h-full flex flex-col bg-[#0a0a0a]">
          <MoveEditor
            path={editing.kind === "toml" ? "Move.toml" : current?.path ?? "scripts/main.move"}
            value={editing.kind === "toml" ? effectiveToml : current?.content ?? ""}
            onChange={onEditorUpdate}
            className="h-full w-full"
          />
        </div>
      </div>
    </div>
  );
}
