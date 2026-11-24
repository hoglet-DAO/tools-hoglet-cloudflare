"use client";

import { useEffect, useState } from "react";
import { Download, FileCode2 } from "lucide-react";
import { MoveEditor } from "@/components/governance/MoveEditor";
import type { SourceFiles, VerificationView } from "./types";

export function SourcePanel({
  source,
  verification,
  t,
}: {
  source: SourceFiles;
  verification: VerificationView | null;
  t: any;
}) {
  const paths = ["Move.toml", ...Object.keys(source.files).sort()];
  const [selected, setSelected] = useState("Move.toml");

  useEffect(() => {
    setSelected("Move.toml");
  }, [source]);

  const value = selected === "Move.toml" ? source.manifest : source.files[selected] ?? "";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
          <FileCode2 className="h-4 w-4 text-cyan-300" />
          <span>{source.origin === "chain" ? t("originChain") : t("originBundle")}</span>
          {verification?.bundleSha256 && (
            <span className="font-mono text-[10px] text-gray-600">
              {verification.bundleSha256.slice(0, 12)}…
            </span>
          )}
          {verification?.compilerVersion && (
            <span className="text-[10px] text-gray-600">
              {t("toolchain")}: {verification.compilerVersion}
            </span>
          )}
        </div>
        {verification?.bundleSha256 && (
          <a
            href={`/api/verify/bundle/${verification.bundleSha256}?format=zip`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-gray-200 transition-colors hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5" />
            {t("downloadInputs")}
          </a>
        )}
      </div>

      <div className="grid gap-0 md:grid-cols-[220px_1fr]">
        <div className="max-h-48 overflow-y-auto border-b border-white/10 p-2 md:max-h-[420px] md:border-b-0 md:border-r">
          {paths.map((path) => (
            <button
              key={path}
              type="button"
              onClick={() => setSelected(path)}
              className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[11px] ${
                path === selected
                  ? "bg-cyan-400/10 font-bold text-cyan-200"
                  : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
              }`}
              title={path}
            >
              {path}
            </button>
          ))}
        </div>
        <MoveEditor
          key={selected}
          value={value}
          onChange={() => {}}
          path={selected}
          readOnly
          className="h-[420px]"
        />
      </div>
    </div>
  );
}
