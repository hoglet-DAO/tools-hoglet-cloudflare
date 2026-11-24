"use client";

import { AlertTriangle, Check, Terminal, ExternalLink } from "lucide-react";
import type { Diagnostic } from "@/lib/move/diagnostics";

export function ScriptDiagnostics({
  ownDiagnostics,
  output,
  error,
  notice,
  onSelectScript,
}: {
  ownDiagnostics: Diagnostic[];
  output: string;
  error: string | null;
  notice: string | null;
  onSelectScript: (path: string) => void;
}) {
  return (
    <div className="space-y-2 mt-2">
      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-2 text-[11px] text-rose-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {notice && (
        <p className="flex items-start gap-2 rounded-lg border border-purple-400/30 bg-purple-500/10 px-2.5 py-2 text-[11px] text-purple-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {notice}
        </p>
      )}

      {/* Diagnostics List */}
      {ownDiagnostics.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {ownDiagnostics.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelectScript(d.path)}
              className="flex w-full items-start gap-2 rounded-lg border border-white/5 bg-black/40 p-2 text-left text-[11px] transition-colors hover:border-purple-400/30"
            >
              <span
                className={`mt-0.5 shrink-0 font-bold uppercase tracking-wider text-[9px] ${
                  d.severity === "error" ? "text-rose-400" : "text-amber-400"
                }`}
              >
                {d.severity}
              </span>
              <span className="min-w-0 flex-1 font-mono text-gray-300">
                <span className="text-purple-300 underline">{d.path}:{d.line}:{d.column}</span> — {d.message}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Compiler Raw Output */}
      {output && (
        <details className="group rounded-lg border border-white/10 bg-black/40 text-[11px]">
          <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2 font-mono text-gray-400 group-open:border-b group-open:border-white/10">
            <span className="flex items-center gap-1.5">
              <Terminal className="h-3 w-3 text-purple-400" />
              Compiler Output
            </span>
            <span className="text-[10px] text-gray-600">view log</span>
          </summary>
          <pre className="max-h-60 overflow-x-auto p-3 font-mono text-[11px] text-gray-300 whitespace-pre-wrap">
            {output}
          </pre>
        </details>
      )}
    </div>
  );
}
