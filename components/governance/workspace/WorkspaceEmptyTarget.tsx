"use client";

import { Wallet } from "lucide-react";
import { MoveEditor } from "@/components/governance/MoveEditor";
import { starterModule } from "@/lib/move/project";

export function WorkspaceEmptyTarget({
  t,
  creator,
  name,
  onConnect,
}: {
  t: (key: string) => string;
  creator?: string;
  name: string;
  onConnect: () => void;
}) {
  return (
    <>
      <div className="rounded-lg border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2.5 text-[11px] text-amber-100">
        {creator ? t("workspaceResolvingAddress") : t("workspaceNeedAddress")}
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
        <MoveEditor
          value={starterModule(name).source}
          onChange={() => {}}
          path="sources/example.move"
          readOnly
          className="min-h-[260px]"
        />
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-gray-500">{t("workspaceSampleHint")}</p>

      {!creator && (
        <button
          type="button"
          onClick={onConnect}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 px-4 py-2 text-xs font-bold text-white transition-all hover:from-emerald-300 hover:to-teal-500 focus-visible:ring-2 focus-visible:ring-emerald-300/50"
        >
          <Wallet className="w-3.5 h-3.5" />
          {t("connectWalletCta")}
        </button>
      )}
    </>
  );
}
