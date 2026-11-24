"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { formatBytes } from "@/lib/governance/buildArtifacts";
import { readFolderFiles } from "./readFolder";

export function SubmitSources({
  network,
  address,
  packageName,
  canUseChainSource,
  onVerified,
  t,
}: {
  network: "mainnet" | "testnet";
  address: string;
  packageName: string;
  canUseChainSource: boolean;
  onVerified: () => void;
  t: any;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = files ? Object.keys(files).length : 0;
  const bytes = files ? Object.values(files).reduce((n, content) => n + content.length, 0) : 0;

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = await readFolderFiles(event.target);
    setFiles(picked);
    setError(null);
    event.target.value = "";
  }

  async function submit(payload: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network, address, package: packageName, files: payload }),
      });
      const body = (await res.json().catch(() => ({}))) as any;
      if (res.status === 429) {
        setError(t("rateLimited"));
        return;
      }
      if (res.status === 503) {
        setError(body.error === "verification storage is unavailable" ? t("unavailable") : t("busy"));
        return;
      }
      if (res.status === 413) {
        setError(t("tooLarge"));
        return;
      }
      if (!res.ok || body.ok !== true) {
        setError(body.error || t("failed"));
        return;
      }
      onVerified();
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="text-sm font-bold text-white">{t("submit")}</h3>
      <p className="mt-1 text-xs text-gray-500">{t("submitHint")}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold text-gray-200 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <Upload className="h-3.5 w-3.5" />
          {t("chooseFolder")}
        </button>
        {files && (
          <span className="text-[11px] text-gray-500">
            {count} files · {formatBytes(bytes)}
          </span>
        )}
      </div>

      <input
        ref={input}
        type="file"
        multiple
        // @ts-expect-error non-standard but universally supported
        webkitdirectory=""
        className="hidden"
        onChange={pick}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => submit(files ?? {})}
          disabled={busy || count === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {busy ? t("verifying") : t("verify")}
        </button>
        {canUseChainSource && (
          <button
            type="button"
            onClick={() => submit({})}
            disabled={busy}
            className="rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold text-gray-300 transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            {t("verifyFromChain")}
          </button>
        )}
      </div>

      {busy && <p className="mt-2 text-[11px] text-gray-500">{t("verifyHint")}</p>}
      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
    </div>
  );
}
