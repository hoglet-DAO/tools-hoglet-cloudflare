"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { useNetwork } from "@/context/NetworkContext";
import { PackageList } from "./PackageList";
import { SourcePanel } from "./SourcePanel";
import { SubmitSources } from "./SubmitSources";
import type { PackageDetail, PackageRow, SourceFiles } from "./types";

export function VerifyPage({ initialAddress }: { initialAddress: string }) {
  const t = useTranslations("Verify");
  const { network } = useNetwork();
  const verifyNetwork =
    network === "supra-mainnet" ? "mainnet" : network === "supra-testnet" ? "testnet" : null;

  const [address, setAddress] = useState(initialAddress);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const [source, setSource] = useState<SourceFiles | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [loadingPackage, setLoadingPackage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadList(): Promise<PackageRow[] | null> {
    if (!verifyNetwork) return null;
    setError(null);
    try {
      const res = await fetch(`/api/verify/${verifyNetwork}/${address.trim()}`);
      const body = (await res.json().catch(() => ({}))) as any;
      if (res.status === 403) {
        setError(t("restricted"));
        return null;
      }
      if (res.status === 503) {
        setError(t("unavailable"));
        return null;
      }
      if (!res.ok || body.ok !== true) {
        setError(body.error || t("failed"));
        return null;
      }
      return (body.packages ?? []) as PackageRow[];
    } catch {
      setError(t("failed"));
      return null;
    }
  }

  async function scan() {
    setScanning(true);
    setSelected(null);
    setDetail(null);
    setSource(null);
    const rows = await loadList();
    if (rows) setPackages(rows);
    setScanned(true);
    setScanning(false);
  }

  async function open(pkg: PackageRow) {
    if (!verifyNetwork) return;
    setSelected(pkg.name);
    setLoadingPackage(true);
    setDetail(null);
    setSource(null);
    setError(null);
    try {
      const [detailRes, sourceRes] = await Promise.all([
        fetch(`/api/verify/${verifyNetwork}/${address.trim()}/${pkg.name}`),
        fetch(`/api/verify/${verifyNetwork}/${address.trim()}/${pkg.name}/source`),
      ]);
      const detailBody = (await detailRes.json().catch(() => ({}))) as any;
      if (detailBody.ok) setDetail(detailBody.package as PackageDetail);
      else setError(detailBody.error || t("failed"));

      const sourceBody = (await sourceRes.json().catch(() => ({}))) as any;
      if (sourceBody.ok) setSource(sourceBody as SourceFiles);
    } catch {
      setError(t("failed"));
    } finally {
      setLoadingPackage(false);
    }
  }

  async function refresh(name: string) {
    const rows = await loadList();
    if (!rows) return;
    setPackages(rows);
    const pkg = rows.find((p) => p.name === name);
    if (pkg) await open(pkg);
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <h1 className="text-xl font-black text-white sm:text-2xl">{t("title")}</h1>
      <p className="mt-1 max-w-2xl text-xs text-gray-500 sm:text-sm">{t("subtitle")}</p>

      {!verifyNetwork && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          {t("onlySupra")}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void scan();
          }}
          placeholder={t("addressPlaceholder")}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 font-mono text-xs text-gray-200 outline-none placeholder:text-gray-600 focus:border-cyan-400/40"
        />
        <button
          type="button"
          onClick={() => void scan()}
          disabled={scanning || !verifyNetwork || !address.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-5 py-2.5 text-xs font-bold text-cyan-200 transition-colors hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t("scan")}
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {scanned && !scanning && !error && packages.length === 0 && (
        <p className="mt-4 text-xs text-gray-500">{t("noPackages")}</p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
        <PackageList packages={packages} selected={selected} onSelect={(pkg) => void open(pkg)} t={t} />

        <div className="flex min-w-0 flex-col gap-4">
          {loadingPackage && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("loading")}
            </div>
          )}

          {detail && source && <SourcePanel source={source} verification={detail.verification} t={t} />}

          {detail && !source && !detail.hasSource && (
            <p className="text-xs text-gray-500">{t("noSource")}</p>
          )}

          {detail &&
            (!detail.verification || detail.verification.status !== "verified") && (
              <SubmitSources
                network={verifyNetwork!}
                address={address.trim()}
                packageName={detail.name}
                canUseChainSource={detail.hasChainSource}
                onVerified={() => void refresh(detail.name)}
                t={t}
              />
            )}

          {!detail && !loadingPackage && packages.length > 0 && (
            <p className="text-xs text-gray-600">{t("pickPackage")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
