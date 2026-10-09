"use client";

import { AlertTriangle, Check, Info } from "lucide-react";
import type { Diagnostic } from "@/lib/move/diagnostics";

export function WorkspaceDiagnostics({
  t,
  ownDiagnostics,
  externalDiagnostics,
  output,
  error,
  notice,
  saveState,
  onSelectModule,
}: {
  t: any;
  ownDiagnostics: Diagnostic[];
  externalDiagnostics: Diagnostic[];
  output: string;
  error: string | null;
  notice: string | null;
  saveState: string;
  onSelectModule: (path: string) => void;
}) {
  return (
    <>
      {saveState === "quota" || saveState === "blocked" || saveState === "unavailable" ? (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-bold">{t("workspaceSaveFailed")} </span>
            {saveState === "quota" ? t("workspaceSaveQuota") : t("workspaceSaveBlocked")}
          </span>
        </p>
      ) : (
        <p className="mt-2 flex items-center gap-2 text-[10px] text-gray-600">
          {saveState === "saved" ? <Check className="h-3 w-3 text-emerald-500" /> : <span className="h-3 w-3" />}
          {saveState === "saved" ? t("workspaceSaved") : t("workspaceNote")}
        </p>
      )}

      {error && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-2 text-[11px] text-rose-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {notice && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] leading-relaxed text-gray-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300/60" />
          {notice}
        </p>
      )}

      {ownDiagnostics.length > 0 && (
        <ul className="mt-2 space-y-1">
          {ownDiagnostics.slice(0, 8).map((d) => (
            <li
              key={`${d.path}:${d.line}:${d.column}`}
              className={`flex flex-wrap items-baseline gap-2 rounded-md px-2 py-1 font-mono text-[10px] ${
                d.severity === "error" ? "bg-rose-500/10" : "bg-black/40"
              }`}
            >
              <span
                className={`shrink-0 font-bold uppercase ${
                  d.severity === "error" ? "text-rose-300" : "text-amber-300/80"
                }`}
              >
                {d.code || d.severity}
              </span>
              <button
                type="button"
                onClick={() => onSelectModule(d.path)}
                className="text-cyan-300 underline decoration-dotted underline-offset-2 hover:text-cyan-200"
              >
                {d.path}:{d.line}
              </button>
              <span className="text-gray-400">{d.message}</span>
            </li>
          ))}
        </ul>
      )}

      {externalDiagnostics.length > 0 && (
        <p className="mt-2 text-[10px] leading-relaxed text-gray-600">
          {t("workspaceFrameworkNoise", { count: externalDiagnostics.length })}
        </p>
      )}

      {(output || ownDiagnostics.length === 0) && output && (
        <details className="mt-2 rounded-lg bg-black/40 px-2.5 py-2">
          <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {t("workspaceOutput")}
          </summary>
          <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-gray-400">
            {output.slice(0, 4000)}
          </pre>
        </details>
      )}
    </>
  );
}
