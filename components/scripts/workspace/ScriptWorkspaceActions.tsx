"use client";

import { useState, useRef, useEffect } from "react";
import {
  Loader2,
  Play,
  Upload,
  Download,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  UserCheck,
  Send,
  ShieldCheck,
  FileCode,
} from "lucide-react";
import { STARTER_SCRIPTS, type ScriptTemplate } from "../scriptTemplates";
import { formatBytes } from "@/lib/governance/buildArtifacts";

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  basic: UserCheck,
  multiTransfer: Send,
  airdropCheck: ShieldCheck,
};

export function ScriptWorkspaceActions({
  compiling,
  scriptsLength,
  result,
  sourceBytes,
  onCompile,
  onImport,
  onExport,
  onLoadTemplate,
  onCopyAiPrompt,
  copiedAi,
}: {
  compiling: boolean;
  scriptsLength: number;
  result: { ok: boolean; scriptsCount: number; ms: number; cached: boolean; sizeBytes?: number } | null;
  sourceBytes: number;
  onCompile: () => void;
  onImport: (files: { name: string; content: string }[]) => void;
  onExport: () => void;
  onLoadTemplate: (key: string) => void;
  onCopyAiPrompt: () => void;
  copiedAi: boolean;
}) {
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setTemplatesOpen(false);
      }
    }
    if (templatesOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [templatesOpen]);

  const handleSelectTemplate = (key: string) => {
    onLoadTemplate(key);
    setTemplatesOpen(false);
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2 border-t border-white/10 pt-3 relative">
      {/* Primary Action: Compile */}
      <button
        type="button"
        disabled={compiling || scriptsLength === 0}
        onClick={onCompile}
        className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-2 font-mono text-[12px] font-bold text-white shadow-lg shadow-purple-600/20 transition-all hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {compiling ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Compiling…
          </>
        ) : (
          <>
            <Play className="h-3.5 w-3.5 fill-white" />
            Compile Script
          </>
        )}
      </button>

      {/* Templates Selector Dropdown (Click-based) */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setTemplatesOpen((prev) => !prev)}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-colors ${
            templatesOpen
              ? "border-purple-500/50 bg-purple-500/10 text-white"
              : "border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07] hover:text-white"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          <span>Templates</span>
          {templatesOpen ? (
            <ChevronUp className="h-3 w-3 text-purple-300" />
          ) : (
            <ChevronDown className="h-3 w-3 text-gray-400" />
          )}
        </button>

        {/* Floating Menu (Responsive max-width) */}
        {templatesOpen && (
          <div className="absolute left-0 bottom-full mb-2 w-[min(20rem,calc(100vw-2.5rem))] rounded-xl border border-purple-500/30 bg-zinc-950 p-2 shadow-2xl z-50 animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="px-2 py-1.5 border-b border-white/5 mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                Starter Templates
              </span>
              <span className="text-[9px] text-gray-500">Click to load</span>
            </div>

            <div className="space-y-1">
              {Object.entries(STARTER_SCRIPTS).map(([key, item]) => {
                const IconComponent = TEMPLATE_ICONS[key] || FileCode;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectTemplate(key)}
                    className="w-full text-left p-2 rounded-lg hover:bg-purple-500/10 border border-transparent hover:border-purple-500/20 transition-all group"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2">
                        <IconComponent className="h-3.5 w-3.5 text-purple-400 group-hover:text-purple-300 shrink-0" />
                        <span className="text-xs font-semibold text-gray-200 group-hover:text-white">
                          {item.name}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-purple-300 border border-white/5">
                        {item.tag}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 leading-snug pl-5.5">
                      {item.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Export */}
      <button
        type="button"
        onClick={onExport}
        title="Export script files as ZIP"
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-gray-300 transition-colors hover:bg-white/[0.07] hover:text-white"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden xs:inline">Export</span>
      </button>

      {/* Import */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        title="Import script files"
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-gray-300 transition-colors hover:bg-white/[0.07] hover:text-white"
      >
        <Upload className="h-3.5 w-3.5" />
        <span className="hidden xs:inline">Import</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".move,.toml"
        className="hidden"
        onChange={async (e) => {
          const fileList = Array.from(e.target.files || []);
          if (!fileList.length) return;
          const readFiles = await Promise.all(
            fileList.map(async (f) => ({ name: f.name, content: await f.text() }))
          );
          onImport(readFiles);
          e.target.value = "";
        }}
      />

      {/* AI Pack Copy */}
      <button
        type="button"
        onClick={onCopyAiPrompt}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-gray-300 transition-colors hover:bg-white/[0.07] hover:text-white"
      >
        {copiedAi ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Sparkles className="h-3.5 w-3.5 text-purple-400" />}
        <span>{copiedAi ? "Copied" : "AI Helper"}</span>
      </button>

      {/* Size and Status Readout (Responsive wrap) */}
      <div className="w-full sm:w-auto sm:ml-auto mt-2 sm:mt-0 flex flex-wrap items-center justify-between sm:justify-end gap-2 font-mono text-[10px] sm:text-[11px] text-gray-500">
        <span>{formatBytes(sourceBytes)} source</span>
        {result?.ok && (
          <span className="text-emerald-400">
            • {result.scriptsCount} script(s) ({result.ms} ms)
          </span>
        )}
      </div>
    </div>
  );
}
