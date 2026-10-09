"use client";

import { Check, Copy, ExternalLink, Code2, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function WorkspaceIdentity({
  t,
  name,
  nameOk,
  labelOk,
  target,
  seed,
  explorerUrl,
  onNameChange,
  onSeedChange,
}: {
  t: any;
  name: string;
  nameOk: boolean;
  labelOk: boolean;
  target: string;
  seed: string;
  explorerUrl: string | null;
  onNameChange: (v: string) => void;
  onSeedChange: (v: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {t("workspacePackageName")}
          </span>
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            spellCheck={false}
            className={`mt-1 w-full rounded-lg border bg-black/40 px-2.5 py-2 font-mono text-[12px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40 ${
              nameOk ? "border-white/10" : "border-rose-400/50"
            }`}
          />
        </label>
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {t("workspaceDeployTarget")}
          </span>
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-cyan-200/90">{target}</code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(target);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              aria-label={t("copyAddress")}
              title={t("copyAddress")}
              className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-gray-400" />}
            </button>
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("workspaceOpenExplorer")}
                title={t("workspaceOpenExplorer")}
                className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-cyan-300"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <Link
              href={`/interactor?address=${target}`}
              aria-label={t("workspaceOpenInteractor")}
              title={t("workspaceOpenInteractor")}
              className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-emerald-300"
            >
              <Code2 className="w-3 h-3" />
            </Link>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-gray-600">{t("workspaceDeployTargetHint")}</p>
        </div>
      </div>

      <details className="group mt-2">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-600 transition-colors hover:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40">
          <ChevronDown className="h-3 w-3 transition-transform duration-200 group-open:rotate-180" />
          {t("workspaceSeed")}
          {seed.trim() && (
            <span className="ml-1 max-w-[16rem] truncate font-mono text-[10px] font-normal normal-case tracking-normal text-cyan-300/80">
              {seed.trim()}
            </span>
          )}
        </summary>
        <div className="mt-2">
          <input
            value={seed}
            onChange={(e) => onSeedChange(e.target.value)}
            placeholder={name}
            spellCheck={false}
            className={`w-full rounded-lg border bg-black/40 px-2.5 py-2 font-mono text-[12px] text-white placeholder:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40 ${
              labelOk ? "border-white/10" : "border-rose-400/50"
            }`}
          />
          <p className="mt-1.5 text-[10px] leading-relaxed text-gray-600">{t("workspaceSeedHint")}</p>
        </div>
      </details>
    </>
  );
}
