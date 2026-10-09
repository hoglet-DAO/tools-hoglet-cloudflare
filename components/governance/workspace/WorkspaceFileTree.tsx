"use client";

import {
  AlertTriangle,
  Package,
  FolderOpen,
  FilePlus2,
  FileText,
  FileCode2,
  Pencil,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { MoveEditor } from "@/components/governance/MoveEditor";
import type { MoveModule } from "@/lib/move/project";

const ACTIVE_ROW_CLS = "bg-emerald-500/10 text-emerald-200";
const INACTIVE_ROW_CLS = "text-gray-400 hover:bg-white/5";

export function WorkspaceFileTree({
  t,
  name,
  modules,
  editing,
  tomlOverride,
  effectiveToml,
  target,
  adding,
  newPath,
  renaming,
  renameValue,
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
  target?: string;
  adding: boolean;
  newPath: string;
  renaming: number | null;
  renameValue: string;
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
    <div className="mt-2 overflow-hidden rounded-lg border border-white/10">
      <div className="flex">
        <ul className="w-52 shrink-0 border-r border-white/10 bg-black/30 py-1 font-mono text-[11px]">
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
              <FileText className="h-3 w-3 shrink-0" />
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
                    <FileCode2 className="h-3 w-3 shrink-0" />
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
                  <button
                    type="button"
                    onClick={() => onRemoveModule(i)}
                    aria-label={t("workspaceDelete")}
                    className="shrink-0 rounded p-0.5 text-gray-700 opacity-0 transition-opacity hover:text-rose-300 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="flex min-h-0 flex-1 flex-col">
          {editing.kind === "toml" ? (
            <MoveEditor
              value={effectiveToml}
              onChange={onEditorUpdate}
              path="Move.toml"
              className="min-h-[280px]"
            />
          ) : current ? (
            <MoveEditor value={current.source} onChange={onEditorUpdate} path={current.path} />
          ) : (
            <div className="p-3 text-[11px] text-gray-500">{t("workspaceNoFile")}</div>
          )}
        </div>
      </div>

      {/*
        The manifest is what the deploy actually sends: if its named address is not the account the package
        publishes to, the compile is clean and the publish fails on-chain, after signing. So the check is
        surfaced right here, next to the file it is about, rather than left to the transaction to reveal.
      */}
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
                  <li key={e} className="font-mono text-[10px] text-rose-200/90">
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
                  <li key={w} className="font-mono text-[10px] text-amber-200/90">
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
