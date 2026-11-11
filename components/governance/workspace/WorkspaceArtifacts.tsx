"use client";

import { useState } from "react";
import { Boxes, Check, Copy, Download } from "lucide-react";
import { formatBytes } from "@/lib/governance/buildArtifacts";
import { createZip, type ZipEntry } from "@/lib/move/zip";

/** One compiled module's bytecode, in the shape publish sends on-chain. */
export interface CompiledModuleBytes {
  /** Display name from the ModuleID (e.g. `Pool`). */
  name: string;
  /** `0x`-prefixed hex of the module's `.mv`. */
  hex: string;
  /** Decoded length in bytes, excluding the `0x`. */
  bytes: number;
}

/** Byte length of a `0x`-prefixed hex string, tolerating a bare value. */
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

/** Hex chars shown in the collapsed preview line. */
const PREVIEW_CHARS = 32;

/**
 * The compiled bytecode the deploy step is about to publish, per module.
 *
 * Provides inspectable hex previews, single-click copy, and binary downloads (.mv / .zip)
 * for developers who want to use the compiled artifacts outside the browser.
 */
export function WorkspaceArtifacts({
  t,
  modules,
  metadataHex,
  packageName = "package",
}: {
  t: any;
  modules: CompiledModuleBytes[];
  /** `0x`-prefixed hex of `package-metadata.bcs`; shown as a secondary line when present. */
  metadataHex?: string | null;
  packageName?: string;
}) {
  const [copiedMeta, setCopiedMeta] = useState(false);
  if (!modules.length) return null;
  const totalBytes = modules.reduce((a, m) => a + m.bytes, 0);
  const metadataBytes = metadataHex ? hexByteLength(metadataHex) : null;

  const downloadAll = () => {
    try {
      const entries: ZipEntry[] = modules.map((m) => {
        const cleanName = m.name.includes("::") ? m.name.split("::").pop() : m.name;
        return {
          path: `${cleanName || "module"}.mv`,
          content: hexToBytes(m.hex),
        };
      });

      if (metadataHex) {
        entries.push({
          path: "package-metadata.bcs",
          content: hexToBytes(metadataHex),
        });
      }

      const zipBytes = createZip(entries);
      const blob = new Blob([zipBytes.slice().buffer as ArrayBuffer], { type: "application/zip" });
      downloadBlob(blob, `${packageName || "package"}-compiled.zip`);
    } catch (e: any) {
      console.error("Failed to create bytecode zip", e);
    }
  };

  const downloadMetadata = () => {
    if (!metadataHex) return;
    const bytes = hexToBytes(metadataHex);
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/octet-stream" });
    downloadBlob(blob, "package-metadata.bcs");
  };

  const copyMetadata = () => {
    if (!metadataHex) return;
    navigator.clipboard.writeText(metadataHex);
    setCopiedMeta(true);
    setTimeout(() => setCopiedMeta(false), 1500);
  };

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Boxes className="h-3.5 w-3.5 text-cyan-300 shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
          {t("workspaceArtifacts")}
        </span>
        <span className="ml-auto font-mono text-[10px] text-gray-500">
          {t("workspaceArtifactsTotal", { count: modules.length, size: formatBytes(totalBytes) })}
        </span>
        <button
          type="button"
          onClick={downloadAll}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-200 transition-colors hover:bg-cyan-500/20"
          title={`${t("workspaceExport")} (.zip)`}
        >
          <Download className="h-3 w-3" />
          <span>{t("workspaceExport")} (.zip)</span>
        </button>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-gray-600">{t("workspaceArtifactsHint")}</p>

      <ul className="mt-2.5 space-y-1.5">
        {modules.map((m, i) => (
          <ModuleRow key={`${m.name}-${i}`} t={t} module={m} />
        ))}
      </ul>

      {metadataBytes != null && metadataBytes > 0 && (
        <div className="mt-2 flex items-center gap-2 border-t border-white/5 pt-2 text-[10px]">
          <span className="min-w-0 truncate font-mono text-gray-500">{t("workspaceArtifactsMetadata")}</span>
          <span className="ml-auto shrink-0 font-mono text-gray-400">{formatBytes(metadataBytes)}</span>
          <button
            type="button"
            onClick={downloadMetadata}
            title={`${t("workspaceExport")} (package-metadata.bcs)`}
            aria-label={`${t("workspaceExport")} (package-metadata.bcs)`}
            className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-cyan-200"
          >
            <Download className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={copyMetadata}
            title={t("workspaceArtifactsCopy")}
            aria-label={t("workspaceArtifactsCopy")}
            className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
          >
            {copiedMeta ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      )}
    </div>
  );
}

function ModuleRow({ t, module: m }: { t: any; module: CompiledModuleBytes }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const body = m.hex.startsWith("0x") ? m.hex.slice(2) : m.hex;
  const preview = body.length > PREVIEW_CHARS ? `${body.slice(0, PREVIEW_CHARS)}…` : body;
  const cleanName = m.name.includes("::") ? m.name.split("::").pop() : m.name;

  const copy = () => {
    navigator.clipboard.writeText(m.hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadModule = () => {
    const bytes = hexToBytes(m.hex);
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/octet-stream" });
    downloadBlob(blob, `${cleanName || "module"}.mv`);
  };

  return (
    <li className="rounded-lg border border-white/10 bg-black/30">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-cyan-200/90" title={m.name}>
          {m.name}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-gray-500">{formatBytes(m.bytes)}</span>
        <button
          type="button"
          onClick={downloadModule}
          title={`${t("workspaceExport")} (${cleanName}.mv)`}
          aria-label={`${t("workspaceExport")} (${cleanName}.mv)`}
          className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-cyan-200"
        >
          <Download className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={copy}
          title={t("workspaceArtifactsCopy")}
          aria-label={t("workspaceArtifactsCopy")}
          className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
        >
          {open ? t("workspaceArtifactsHide") : t("workspaceArtifactsShow")}
        </button>
      </div>
      <div className="border-t border-white/5 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-gray-500">
        {open ? (
          <span className="block max-h-40 overflow-y-auto break-all whitespace-pre-wrap">{m.hex}</span>
        ) : (
          <span className="block truncate">0x{preview}</span>
        )}
      </div>
    </li>
  );
}

