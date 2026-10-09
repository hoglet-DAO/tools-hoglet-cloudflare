"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Rocket,
  ArrowUpCircle,
  Lock,
  AlertTriangle,
  Vote,
} from "lucide-react";
import { useGovernanceActions } from "@/hooks/features/governance/useGovernanceActions";
import { BurnKeyForm } from "@/components/governance/BurnKeyForm";
import { CancelDelegationForm } from "@/components/governance/CancelDelegationForm";
import { type GovernanceVerdict, type LifecycleStage } from "@/hooks/features/governance/useGovernanceAudit";
import { Shell, StageHeader, StageNotice } from "./lifecycle/LifecycleShared";
import { DeployForm } from "./lifecycle/DeployForm";
import { DonateForm } from "./lifecycle/DonateForm";
import { UpgradeForm, TransferAdminForm, RenounceForm } from "./lifecycle/GovernanceForms";

export type GovernanceMode = "contracts" | "accounts";

/**
 * Runs the governance lifecycle end to end for a single EOA: deploy, upgrade, hand over, freeze.
 *
 * Every entry goes through `useGovernanceActions.execute`, so the whole lifecycle shares one
 * serialization route, one error translation and one success surface.
 */
export function LifecycleRunner({
  mode,
  verdict,
  wallet,
  rpcUrl,
  onAudit,
}: {
  mode: GovernanceMode;
  verdict: GovernanceVerdict | null;
  wallet: string;
  rpcUrl: string;
  onAudit: () => void;
}) {
  const t = useTranslations("Governance");
  const { execute, isPending } = useGovernanceActions();
  const [notice, setNotice] = useState<string | null>(null);

  const stage: LifecycleStage = verdict?.stage ?? "unmanaged";

  const run = async (
    entry: Parameters<typeof execute>[0],
    args: any[],
    opts?: { successAddress?: string }
  ): Promise<string | null> => {
    setNotice(null);
    try {
      const txHash = await execute(entry, { args, ...opts });
      if (txHash) onAudit();
      return txHash ?? null;
    } catch {
      return null;
    }
  };

  if (!wallet) {
    return (
      <Shell>
        <p className="text-sm text-gray-400">{t("runnerConnectWallet")}</p>
      </Shell>
    );
  }

  return (
    <Shell>
      {notice && (
        <p className="mb-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-100">
          {notice}
        </p>
      )}

      {stage === "unmanaged" && (
        <div className="space-y-5">
          <StageHeader
            icon={mode === "contracts" ? Rocket : Vote}
            title={t("stage_unmanaged")}
            body={mode === "contracts" ? t("runnerUnmanagedBody") : t("runnerAccountUnmanagedBody")}
            tone="text-gray-300"
          />

          {mode === "contracts" ? (
            <DeployForm
              t={t}
              isPending={isPending("deploy_autonomous_contract") || isPending("upgrade_contract")}
              run={run}
            />
          ) : (
            <>
              <DonateForm t={t} wallet={wallet} onDone={onAudit} />
              <div className="space-y-4 border-t border-white/10 pt-5">
                <StageHeader
                  icon={Lock}
                  title={t("selfRenounceTitle")}
                  body={t("selfRenounceBody")}
                  tone="text-zinc-400"
                />
                <BurnKeyForm
                  subject={verdict?.subject ?? ""}
                  wallet={wallet}
                  onSigned={onAudit}
                  offerRedirected={verdict?.offerRedirected}
                  offerTarget={verdict?.offerTarget}
                  expectedProxy={verdict?.proxy}
                />
              </div>
            </>
          )}
        </div>
      )}

      {stage === "dual_master" &&
        (mode === "accounts" ? (
          <div className="space-y-5">
            <StageHeader
              icon={AlertTriangle}
              title={t("stage_dual_master")}
              body={t("runnerDualMasterBody")}
              tone="text-rose-300"
            />
            <BurnKeyForm
              subject={verdict?.subject ?? ""}
              wallet={wallet}
              onSigned={onAudit}
              offerRedirected={verdict?.offerRedirected}
              offerTarget={verdict?.offerTarget}
              expectedProxy={verdict?.proxy}
            />
            <CancelDelegationForm subject={verdict?.subject ?? ""} wallet={wallet} onDone={onAudit} />
          </div>
        ) : (
          <StageNotice
            icon={AlertTriangle}
            title={t("stage_dual_master")}
            body={t("runnerDualMasterContractsBody")}
            tone="text-rose-300"
          />
        ))}

      {stage === "governed" &&
        (mode === "contracts" ? (
          <div className="space-y-5">
            <StageHeader
              icon={ArrowUpCircle}
              title={t("stage_governed")}
              body={t("runnerGovernedBody")}
              tone="text-cyan-300"
            />
            <UpgradeForm
              t={t}
              isPending={isPending("upgrade_contract")}
              run={run}
              contract={verdict!.subject}
              isEoa={verdict!.isEoa}
              wallet={wallet}
            />
            <TransferAdminForm t={t} isPending={isPending("transfer_admin")} run={run} contract={verdict!.subject} />
            <RenounceForm t={t} isPending={isPending("renounce_contract")} run={run} contract={verdict!.subject} />
          </div>
        ) : (
          <StageNotice icon={ArrowUpCircle} title={t("stage_governed")} body={t("runnerAccountGovernedBody")} />
        ))}

      {stage === "frozen" && (
        <StageNotice icon={Lock} title={t("stage_frozen")} body={t("runnerFrozenBody")} tone="text-emerald-300" />
      )}
    </Shell>
  );
}

export default LifecycleRunner;