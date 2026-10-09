"use client";

import { useRef } from "react";
import {
  Loader2,
  FlaskConical,
  Upload,
  Download,
  Check,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { STARTER_VARIANTS, type StarterVariant } from "@/lib/move/project";
import type { TestSummary } from "@/lib/move/diagnostics";
import type { IncludedArtifacts } from "@/lib/move/compileService";

export function WorkspaceActions({
  t,
  compiling,
  testing,
  nameOk,
  modulesLength,
  result,
  testResult,
  onCompile,
  onTest,
  onImport,
  onExport,
  onLoadTemplate,
  includedArtifacts,
  onIncludedArtifactsChange,
  overrideSizeCheck,
  onOverrideSizeCheckChange,
}: {
  t: any;
  compiling: boolean;
  testing: boolean;
  nameOk: boolean;
  modulesLength: number;
  result: { ok: boolean; modules: string[]; ms: number; cached: boolean } | null;
  testResult: TestSummary | null;
  onCompile: () => void;
  onTest: () => void;
  onImport: (files: FileList | null, kind: "folder" | "files") => void;
  onExport: () => void;
  onLoadTemplate: (variant: StarterVariant) => void;
  includedArtifacts: IncludedArtifacts | "";
  onIncludedArtifactsChange: (value: IncludedArtifacts | "") => void;
  overrideSizeCheck: boolean;
  onOverrideSizeCheckChange: (value: boolean) => void;
}) {
  const importInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onCompile}
        disabled={compiling || !nameOk || modulesLength === 0}
        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 px-4 py-2 text-xs font-bold text-white transition-all hover:from-emerald-300 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-emerald-300/50"
      >
        <Loader2 className={`w-3.5 h-3.5 ${compiling ? "animate-spin" : ""}`} />
        {compiling ? t("workspaceCompiling") : t("workspaceCompile")}
      </button>

      <button
        type="button"
        onClick={onTest}
        disabled={testing || compiling || !nameOk || modulesLength === 0}
        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold text-gray-200 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-cyan-300/50"
      >
        {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
        {testing ? t("workspaceTesting") : t("workspaceTest")}
      </button>

      <button
        type="button"
        onClick={() => importInput.current?.click()}
        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold text-gray-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300/50"
      >
        <Upload className="w-3.5 h-3.5" />
        {t("workspaceImport")}
      </button>
      <input
        ref={importInput}
        type="file"
        multiple
        // @ts-expect-error non-standard but universally supported
        webkitdirectory=""
        className="hidden"
        onChange={(e) => {
          onImport(e.target.files, "folder");
          e.target.value = "";
        }}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".move,.toml"
        className="hidden"
        onChange={(e) => {
          onImport(e.target.files, "files");
          e.target.value = "";
        }}
      />

      <button
        type="button"
        onClick={onExport}
        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold text-gray-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300/50"
      >
        <Download className="w-3.5 h-3.5" />
        {t("workspaceExport")}
      </button>

      {result?.ok && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
          <Check className="w-3 h-3" />
          {result.cached
            ? t("workspaceCompiledCached", { count: result.modules.length })
            : t("workspaceCompiled", { count: result.modules.length, ms: result.ms })}
        </span>
      )}

      {testResult?.ran && (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
            testResult.ok
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-400/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {testResult.ok ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          {testResult.ok
            ? t("workspaceTestsPassed", { count: testResult.passed })
            : t("workspaceTestsFailed", { passed: testResult.passed, failed: testResult.failed })}
        </span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
          {t("workspaceNewProject")}
        </span>
        {STARTER_VARIANTS.map((variant) => (
          <button
            key={variant}
            type="button"
            onClick={() => onLoadTemplate(variant)}
            title={variant === "basic" ? t("workspaceTemplateBasicHint") : t("workspaceTemplateFullHint")}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-gray-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300/50"
          >
            {variant === "basic" ? t("workspaceTemplateBasic") : t("workspaceTemplateFull")}
          </button>
        ))}
      </div>
      </div>

      {/*
        Advanced, collapsed, off the main path. These steer what the compile service builds and returns, which
        only matters for a package big enough to bump the size cap — so the defaults (smallest metadata,
        override on) are what most packages want, and the controls stay out of the way.
      */}
      <details className="group mt-2">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-600 transition-colors hover:text-gray-400 focus-visible:outline-none">
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
          {t("workspaceAdvanced")}
        </summary>
        <div className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {t("workspaceIncludedArtifacts")}
            </span>
            <select
              value={includedArtifacts}
              onChange={(e) => onIncludedArtifactsChange(e.target.value as IncludedArtifacts | "")}
              className="mt-1 block rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-[11px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40"
            >
              <option value="">default</option>
              <option value="none">none</option>
              <option value="sparse">sparse</option>
              <option value="all">all</option>
            </select>
          </label>

          <label className="flex cursor-pointer items-center gap-2 pb-1.5 text-[11px] text-gray-300 select-none">
            <input
              type="checkbox"
              checked={overrideSizeCheck}
              onChange={(e) => onOverrideSizeCheckChange(e.target.checked)}
              className="h-[16px] w-[16px] shrink-0 accent-emerald-500"
            />
            {t("workspaceOverrideSizeCheck")}
          </label>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-gray-600">{t("workspaceAdvancedHint")}</p>
      </details>
    </>
  );
}
