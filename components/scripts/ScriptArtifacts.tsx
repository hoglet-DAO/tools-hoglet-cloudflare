"use client";

import { useState } from "react";
import {
  Boxes,
  Check,
  Copy,
  Download,
  Terminal,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { formatBytes } from "@/lib/governance/buildArtifacts";
import { createZip, type ZipEntry } from "@/lib/move/zip";

export interface ScriptArtifact {
  name: string;
  bytecodeHex: string;
}

function hexByteLength(hex: string): number {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  return body.length / 2;
}

function hexToBytes(hex: string): Uint8Array {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  const len = body.length / 2;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    u8[i] = parseInt(body.substring(i * 2, i * 2 + 2), 16);
  }
  return u8;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

const PREVIEW_CHARS = 36;

export function ScriptArtifacts({
  artifacts,
  projectName = "script_project",
}: {
  artifacts: ScriptArtifact[];
  projectName?: string;
}) {
  const [showGuide, setShowGuide] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);

  if (!artifacts.length) return null;

  const totalBytes = artifacts.reduce((acc, a) => acc + hexByteLength(a.bytecodeHex), 0);

  const downloadAll = () => {
    try {
      const entries: ZipEntry[] = artifacts.map((a) => {
        const cleanName = a.name.includes("::") ? a.name.split("::").pop() : a.name;
        return {
          path: `${cleanName || "script"}.mv`,
          content: hexToBytes(a.bytecodeHex),
        };
      });

      const zipBytes = createZip(entries);
      const blob = new Blob([zipBytes.slice().buffer as ArrayBuffer], { type: "application/zip" });
      downloadBlob(blob, `${projectName || "scripts"}-compiled.zip`);
    } catch (e: any) {
      console.error("Failed to create zip:", e);
    }
  };

  const primaryScript = artifacts[0]?.name || "main";
  const cliSnippet = `supra move script run --bytecode-path ./${primaryScript}.mv`;

  const copyCliCommand = () => {
    navigator.clipboard.writeText(cliSnippet);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 1500);
  };

  return (
    <div className="mt-4 rounded-xl border border-purple-500/30 bg-purple-950/20 p-3.5 space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300 shrink-0">
            <Boxes className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-200">
              Compiled Script Bytecode
            </h3>
            <p className="text-[11px] text-gray-400">
              {artifacts.length} file{artifacts.length > 1 ? "s" : ""} • {formatBytes(totalBytes)}
            </p>
          </div>
        </div>

        {artifacts.length > 1 && (
          <button
            type="button"
            onClick={downloadAll}
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 px-2.5 py-1 text-[11px] font-semibold text-purple-200 transition-colors"
          >
            <Download className="h-3 w-3" />
            Download All (.zip)
          </button>
        )}
      </div>

      {/* Script List */}
      <ul className="space-y-2">
        {artifacts.map((artifact, idx) => (
          <ScriptRow key={idx} artifact={artifact} />
        ))}
      </ul>

      {/* Compact Expandable Execution Guide */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowGuide((prev) => !prev)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-colors text-left"
        >
          <div className="flex items-center gap-2 text-xs text-purple-300 font-medium">
            <Terminal className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            <span>How to execute this script?</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-gray-400">
            <span>{showGuide ? "Hide instructions" : "Supra CLI & tips"}</span>
            {showGuide ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </div>
        </button>

        {showGuide && (
          <div className="mt-2.5 rounded-lg border border-purple-500/20 bg-black/40 p-3 space-y-3 text-xs animate-in fade-in-50 duration-200">
            {/* Step 1 & 2 */}
            <div className="space-y-1.5 text-gray-300 text-[11px] leading-relaxed">
              <p>
                <strong className="text-white">1. Download the bytecode:</strong> Click the <strong className="text-purple-300">Download</strong> button above to save your <code className="text-purple-300">.mv</code> file.
              </p>
              <p>
                <strong className="text-white">2. Run via Supra CLI:</strong> Execute the transient script directly from your terminal:
              </p>
            </div>

            {/* CLI Snippet Card */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase font-mono tracking-wider text-gray-400">
                  Terminal Command
                </span>
                <button
                  type="button"
                  onClick={copyCliCommand}
                  className="inline-flex items-center gap-1 text-[11px] text-purple-300 hover:text-purple-200 font-medium transition-colors"
                >
                  {copiedCli ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> Copy Command
                    </>
                  )}
                </button>
              </div>
              <div className="font-mono text-[10px] sm:text-[11px] text-purple-200/90 bg-black/70 rounded px-2.5 py-1.5 border border-white/10 overflow-x-auto select-all break-all sm:break-normal">
                {cliSnippet}
              </div>
            </div>

            {/* Friendly Newcomer Note */}
            <div className="pt-1 border-t border-white/5 text-[11px] text-gray-400 leading-normal flex items-start gap-1.5">
              <HelpCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-gray-300">Why not directly in the wallet?</strong> Browser wallets (like StarKey) block raw script execution to protect users against blind-signing attacks. Running via CLI or backend SDK runs it safely on-chain.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScriptRow({ artifact }: { artifact: ScriptArtifact }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const cleanName = artifact.name.includes("::") ? artifact.name.split("::").pop() : artifact.name;
  const byteLen = hexByteLength(artifact.bytecodeHex);
  const cleanHex = artifact.bytecodeHex.startsWith("0x") ? artifact.bytecodeHex.slice(2) : artifact.bytecodeHex;
  const preview = cleanHex.length > PREVIEW_CHARS ? `${cleanHex.slice(0, PREVIEW_CHARS)}…` : cleanHex;

  const downloadFile = () => {
    const bytes = hexToBytes(artifact.bytecodeHex);
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/octet-stream" });
    downloadBlob(blob, `${cleanName || "script"}.mv`);
  };

  const copyHex = () => {
    const formatted = artifact.bytecodeHex.startsWith("0x") ? artifact.bytecodeHex : `0x${artifact.bytecodeHex}`;
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <li className="rounded-lg border border-purple-500/20 bg-black/30">
      <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold text-purple-200">
          {cleanName}.mv
        </span>
        <span className="shrink-0 font-mono text-[9px] sm:text-[10px] text-gray-400 bg-white/5 px-1.5 sm:px-2 py-0.5 rounded">
          {formatBytes(byteLen)}
        </span>

        {/* Download .mv */}
        <button
          type="button"
          onClick={downloadFile}
          title={`Download ${cleanName}.mv`}
          className="shrink-0 inline-flex items-center gap-1 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 px-2 sm:px-2.5 py-1 text-[11px] font-medium text-purple-200 transition-colors"
        >
          <Download className="h-3 w-3" />
          <span className="hidden sm:inline">Download .mv</span>
          <span className="sm:hidden">.mv</span>
        </button>

        {/* Copy Hex */}
        <button
          type="button"
          onClick={copyHex}
          title="Copy Bytecode Hex"
          className="shrink-0 rounded p-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>

        {/* Show/Hide */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded p-1 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          title={open ? "Hide Bytecode Hex" : "View Bytecode Hex"}
        >
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/5 bg-black/50 px-3 py-2 font-mono text-[10px] text-gray-400">
          <div className="flex justify-between items-center mb-1 text-[9px] uppercase tracking-wider text-gray-500">
            <span>Raw Bytecode Hex</span>
            <span>{byteLen} bytes</span>
          </div>
          <span className="block max-h-36 overflow-y-auto break-all whitespace-pre-wrap text-purple-200/80 selection:bg-purple-500 selection:text-white">
            {artifact.bytecodeHex.startsWith("0x") ? artifact.bytecodeHex : `0x${artifact.bytecodeHex}`}
          </span>
        </div>
      )}
    </li>
  );
}
