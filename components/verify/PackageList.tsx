"use client";

import { Boxes } from "lucide-react";
import type { PackageRow } from "./types";

function stateOf(pkg: PackageRow, t: any): { label: string; cls: string } {
  const v = pkg.verification;
  if (v?.status === "verified" && v.exactSource) {
    return { label: t("verifiedExact"), cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" };
  }
  if (v?.status === "verified") {
    return { label: t("verifiedEquivalent"), cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" };
  }
  if (v?.status === "unreproduced") {
    return { label: t("unreproduced"), cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" };
  }
  if (v?.status === "pending") {
    return { label: t("pending"), cls: "border-sky-500/30 bg-sky-500/10 text-sky-300" };
  }
  if (v?.status === "failed") {
    return { label: t("notVerified"), cls: "border-rose-500/30 bg-rose-500/10 text-rose-300" };
  }
  if (pkg.hasChainSource) {
    return { label: t("sourceOnChain"), cls: "border-white/15 bg-white/5 text-gray-300" };
  }
  return { label: t("noSource"), cls: "border-white/10 bg-white/[0.03] text-gray-500" };
}

export function PackageList({
  packages,
  selected,
  onSelect,
  t,
}: {
  packages: PackageRow[];
  selected: string | null;
  onSelect: (pkg: PackageRow) => void;
  t: any;
}) {
  if (packages.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {packages.map((pkg) => {
        const state = stateOf(pkg, t);
        const active = pkg.name === selected;
        return (
          <button
            key={`${pkg.name}-${pkg.upgradeNumber}`}
            type="button"
            onClick={() => onSelect(pkg)}
            className={`w-full rounded-xl border p-3 text-left transition-colors ${
              active
                ? "border-cyan-400/40 bg-cyan-400/10"
                : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-bold text-white">
                <Boxes className="h-4 w-4 text-cyan-300" />
                {pkg.name}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${state.cls}`}>
                {state.label}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
              <span>#{pkg.upgradeNumber}</span>
              <span>{pkg.moduleCount} modules</span>
              {pkg.stale && <span className="text-amber-400/80">{t("stale")}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
