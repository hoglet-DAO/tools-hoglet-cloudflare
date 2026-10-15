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
import { UpgradeForm, GovernanceForm } from "./lifecycle/GovernanceForms";

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
  hideUpgrade = false,
  deployOnly = false,
  collapseUpgrade = false,
}: {
  mode: GovernanceMode;
  verdict: GovernanceVerdict | null;
  wallet: string;
  rpcUrl: string;
  onAudit: () => void;
  /**
   * Drop the upgrade form, keeping only the handover/renounce card.
   *
   * The upgrade form embeds the Move workspace, whose file tree is the visitor's *local* draft
   * (localStorage), not the deployed contract's on-chain source. On a picker surface whose purpose
   * is "choose a contract and renounce it", that editor is noise at best and a source of confusion
   * at worst — so this surface hides it and keeps the irreversible actions reachable.
   */
  hideUpgrade?: boolean;
  /**
   * Always render the deploy form, whatever the audited subject says.
   *
   * The deploy flow derives its own target from `(creator, label)` and asks the factory whether that
   * address is taken, so it never needed a verdict. Keeping it on a stage machine meant the page
   * advertised "who controls this address" and then mostly ignored the answer — the audit bar served
   * the actions, not the deploy. Rendering the deploy form directly makes the page say one thing:
   * this is where you deploy.
   */
  deployOnly?: boolean;
  /**
   * Start the upgrade form collapsed behind a button.
   *
   * Used where the upgrade form is a secondary action on a contract that already exists, so its
   * embedded workspace (a local draft) is not the first thing shown for a contract being managed.
   */
  collapseUpgrade?: boolean;
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

      {deployOnly && mode === "contracts" ? (
        <div className="space-y-5">
          <StageHeader
            icon={Rocket}
            title={t("stage_unmanaged")}
            body={t("runnerUnmanagedBody")}
            tone="text-gray-300"
          />
          <DeployForm
            t={t}
            isPending={isPending("deploy_autonomous_contract") || isPending("upgrade_contract")}
            run={run}
          />
        </div>
      ) : (
        <>
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
            {!hideUpgrade &&
              (collapseUpgrade ? (
                <UpgradeReveal>
                  <UpgradeForm
                    t={t}
                    isPending={isPending("upgrade_contract")}
                    run={run}
                    contract={verdict!.subject}
                    isEoa={verdict!.isEoa}
                    wallet={wallet}
                  />
                </UpgradeReveal>
              ) : (
                <UpgradeForm
                  t={t}
                  isPending={isPending("upgrade_contract")}
                  run={run}
                  contract={verdict!.subject}
                  isEoa={verdict!.isEoa}
                  wallet={wallet}
                />
              ))}
            <GovernanceForm
              t={t}
              pendingTransfer={isPending("transfer_admin")}
              pendingRenounce={isPending("renounce_contract")}
              run={run}
              contract={verdict!.subject}
              admin={verdict!.admin}
              wallet={wallet}
            />
          </div>
        ) : (
          <StageNotice icon={ArrowUpCircle} title={t("stage_governed")} body={t("runnerAccountGovernedBody")} />
        ))}

      {stage === "frozen" && (
        <StageNotice icon={Lock} title={t("stage_frozen")} body={t("runnerFrozenBody")} tone="text-emerald-300" />
      )}
        </>
      )}
    </Shell>
  );
}

/**
 * Keeps an upgrade form out of the way until it is asked for.
 *
 * The upgrade form's first screen is the Move workspace, and its file tree is the visitor's local
 * draft rather than anything about the deployed contract. On a surface whose job is managing a
 * contract that already exists, opening on that editor answered a question nobody asked — and the
 * draft's package name has no relation to the contract being managed, which read as if it did.
 */
function UpgradeReveal({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Governance");
  const [open, setOpen] = useState(false);
  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-bold text-gray-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-300/50"
        >
          {t("upgradeReveal")}
        </button>
      )}
      {open && children}
    </>
  );
}

export default LifecycleRunner;