"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ArrowUpRight, FileCode2, Loader2, ShieldCheck } from "lucide-react";
import { useNetwork } from "@/context/NetworkContext";
import { SourcePanel } from "@/components/verify/SourcePanel";
import type { PackageRow, SourceFiles } from "@/components/verify/types";

function badge(pkg: PackageRow, t: any): { label: string; cls: string } {
  const v = pkg.verification;
  if (v?.status === "verified" && v.exactSource) {
    return { label: t("verifiedExact"), cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" };
  }
  if (v?.status === "verified") {
    return { label: t("verifiedEquivalent"), cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" };
  }
  if (v?.status === "unreproduced") {
    return { label: t("unreproduced"), cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" };
  }
  if (v?.status === "failed") {
    return { label: t("notVerified"), cls: "border-rose-400/30 bg-rose-400/10 text-rose-300" };
  }
  return { label: t("sourceOnChain"), cls: "border-white/15 bg-white/5 text-gray-300" };
}

export function SourceTab({ address, moduleName }: { address: string; moduleName: string }) {
  const t = useTranslations("Verify");
  const { network } = useNetwork();
  const verifyNetwork =
    network === "supra-mainnet" ? "mainnet" : network === "supra-testnet" ? "testnet" : null;

  const [pkg, setPkg] = useState<PackageRow | null>(null);
  const [source, setSource] = useState<SourceFiles | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPkg(null);
    setSource(null);

    if (!verifyNetwork || !address || !moduleName) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const listRes = await fetch(`/api/verify/${verifyNetwork}/${address}`);
        const list = (await listRes.json().catch(() => ({}))) as any;
        if (cancelled) return;
        if (!list.ok) {
          setError(list.error || t("failed"));
          return;
        }
        const found =
          (list.packages as PackageRow[]).find((p) => (p.modules || []).includes(moduleName)) ?? null;
        setPkg(found);
        if (!found) return;

        const srcRes = await fetch(`/api/verify/${verifyNetwork}/${address}/${found.name}/source`);
        const src = (await srcRes.json().catch(() => ({}))) as any;
        if (!cancelled && src.ok) setSource(src as SourceFiles);
      } catch {
        if (!cancelled) setError(t("failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, moduleName, verifyNetwork, t]);

  if (!verifyNetwork) {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-xs text-amber-200">
        {t("onlySupra")}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
        <div className="h-[360px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.02]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-xs text-rose-200">
        {error}
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="text-xs text-gray-400">
          This module is not part of a package in the on-chain registry.
        </p>
        <Link
          href={`/verify?address=${address}`}
          className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-cyan-300 hover:text-cyan-200"
        >
          Open the verifier <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  const state = badge(pkg, t);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-white">
            <FileCode2 className="h-4 w-4 text-cyan-300" />
            {pkg.name}
          </span>
          <span className="text-[10px] text-gray-500">#{pkg.upgradeNumber}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${state.cls}`}>
            {state.label}
          </span>
        </div>
        <Link
          href={`/verify?address=${address}&package=${pkg.name}`}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-400 transition-colors hover:text-cyan-200"
        >
          Open in verifier <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {source ? (
        <SourcePanel source={source} verification={pkg.verification} t={t} />
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/[0.09] via-white/[0.02] to-transparent p-5 sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-md">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t("noSource")}
              </div>
              <h3 className="text-sm font-bold text-white">
                This package was published without its source.
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                If you have the repository, upload it and the verifier will reproduce the bytecode
                before showing it here.
              </p>
            </div>
            <Link
              href={`/verify?address=${address}&package=${pkg.name}`}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-4 py-2.5 text-xs font-bold text-cyan-200 transition-colors hover:bg-cyan-500/25"
            >
              Verify source <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
