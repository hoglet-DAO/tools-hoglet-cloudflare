"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, Loader2, ShieldQuestion } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSupraWallet } from "@/context/SupraWalletContext";
import { useGovernanceAudit, type GovernanceVerdict } from "@/hooks/features/governance/useGovernanceAudit";
import { STATUS_META, STAGE_KEY } from "@/components/governance/statusMeta";
import { sameAddress } from "@/lib/governance/offerChallenge";
import { ZERO_AUTH_KEY } from "@/utils/supra/constants";

/**
 * Asks the DAO contracts vault who actually governs a contract.
 *
 * The badge next to this in `ModuleNavigation` infers control from the account's AuthKey: a zero key
 * means "Resource Account", which it then has to hedge about — "it MAY be permanently renounced, OR it
 * could be a Resource Account controlled by a SignerCapability". That guess is sometimes wrong in both
 * directions, because a zero AuthKey looks identical whether the signer was deliberately destroyed or
 * merely lives in a capability the chain cannot see.
 *
 * When the contract was deployed through this pipeline the answer is not a guess: the factory keeps a
 * record of it, names the admin, and knows whether the capability was annihilated. This asks exactly
 * that, and says plainly when the factory does not know the address — which is itself the useful
 * answer, because it is the boundary of what can be proven.
 *
 * Deliberately on-demand: the read is eleven view calls, so it runs when someone asks rather than on
 * every contract the Interactor loads.
 */
export function ContractGovernanceModal({
  contractAddress,
  authKey,
  trigger,
}: {
  contractAddress?: string;
  /** The account's authentication key, so the modal can show the AuthKey half of the picture too. */
  authKey?: string | null;
  /** Custom trigger; the default is a small shield button. */
  trigger?: React.ReactNode;
}) {
  const t = useTranslations("Governance");
  const { rpcUrl, accounts } = useSupraWallet();
  const { audit } = useGovernanceAudit();
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState<GovernanceVerdict | null>(null);
  const [loading, setLoading] = useState(false);

  const wallet = accounts[0] || "";

  useEffect(() => {
    if (!open || !rpcUrl || !contractAddress) return;
    let live = true;
    setLoading(true);
    setVerdict(null);
    audit(rpcUrl, contractAddress).then(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [open, rpcUrl, contractAddress, audit]);

  const meta = verdict ? STATUS_META[verdict.status as keyof typeof STATUS_META] ?? STATUS_META[0] : null;
  // "The factory knows this contract": it is catalogued, or its record is a tombstone left by renounce.
  const knownToFactory = !!verdict && (verdict.factoryManaged === true || verdict.contractRenounced === true);

  /*
    The AuthKey half. Same three states the module-list badge shows, computed here so the modal is the
    one place that explains them: a zero key means no key of its own, a key equal to the address is the
    deployer's own, and a key pointing elsewhere means the key was rotated away.
  */
  const isResourceAccount = authKey === ZERO_AUTH_KEY;
  const isExternalAdmin =
    !isResourceAccount && !!authKey && !!contractAddress && authKey.toLowerCase() !== contractAddress.toLowerCase();
  const keyState = isResourceAccount ? "keyResourceAccount" : isExternalAdmin ? "keyAdminRotated" : "keyUpgradeable";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            title={t("interactorGovernanceCheck")}
            aria-label={t("interactorGovernanceCheck")}
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 transition-colors hover:border-cyan-300/40 hover:text-cyan-200 focus-visible:ring-2 focus-visible:ring-cyan-300/50"
          >
            <ShieldQuestion className="h-3 w-3" />
            {t("interactorGovernanceCheck")}
          </button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md border-white/10 bg-[#0B0D17] text-white">
        <DialogHeader>
          <DialogTitle className="text-base">{t("interactorGovernanceTitle")}</DialogTitle>
          <DialogDescription className="break-all text-[11px] leading-relaxed text-gray-500">
            {contractAddress || "—"}
          </DialogDescription>
        </DialogHeader>

        {!contractAddress ? (
          <p className="text-[11px] text-gray-500">{t("interactorGovernanceNoAddress")}</p>
        ) : (
          <div className="space-y-3">
            {/* The AuthKey facts — the "Upgradeable / Resource Account / Admin rotated" state, explained once, here. */}
            {authKey && (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  {t("interactorGovernanceKeyTitle")}
                </p>
                <p className="mt-1 text-[11px] font-bold text-gray-200">{t(keyState)}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-gray-500">{t(`${keyState}Hint`)}</p>
                <div className="mt-1.5 break-all font-mono text-[9px] text-gray-600">
                  {t("interactorAuthKey")}: {authKey}
                </div>
              </div>
            )}

            {loading ? (
              <p className="flex items-center gap-2 text-[11px] text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("interactorGovernanceLoading")}
              </p>
            ) : !verdict ? (
              <p className="text-[11px] leading-relaxed text-rose-200">{t("interactorGovernanceError")}</p>
            ) : !knownToFactory ? (
          /* The honest negative. Not an error, and not a pass: the factory has no record, so control
             cannot be established from here and the AuthKey badge remains an inference. */
          <div className="space-y-2">
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-gray-300">
              <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" />
              {t("interactorGovernanceUnknown")}
            </p>
            <p className="text-[10px] leading-relaxed text-gray-600">{t("interactorGovernanceUnknownHint")}</p>
          </div>
        ) : (
              <>
                <div className={`flex items-start gap-2.5 rounded-lg border p-3 ${meta?.edge ?? "border-white/10"} ${meta?.wash ?? "bg-white/5"}`}>
              {meta?.icon && <meta.icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.accent}`} />}
              <div className="min-w-0">
                <p className={`text-[12px] font-bold ${meta?.accent ?? "text-gray-400"}`}>
                  {meta ? t(meta.key) : t("analyzing")}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  {t(STAGE_KEY[verdict.stage])}
                </p>
              </div>
            </div>

            <dl className="space-y-1.5">
              <div className="flex items-center gap-2 border-b border-white/5 pb-1.5">
                <dt className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-gray-600">
                  {t("admin")}
                </dt>
                <dd className="min-w-0 flex-1 break-all font-mono text-[11px] text-gray-300">
                  {verdict.admin || "0x0"}
                  {wallet && sameAddress(verdict.admin, wallet) && (
                    <span className="ml-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                      {t("you")}
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex items-center gap-2 pb-1">
                <dt className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-gray-600">
                  {t("interactorGovernanceRenounced")}
                </dt>
                <dd
                  className={`text-[11px] font-bold ${
                    verdict.contractRenounced ? "text-emerald-400" : "text-cyan-300"
                  }`}
                >
                  {verdict.contractRenounced ? t("yes") : t("no")}
                </dd>
              </div>
            </dl>

            <p className="text-[10px] leading-relaxed text-gray-600">
              {verdict.contractRenounced
                ? t("interactorGovernanceFrozenHint")
                : t("interactorGovernanceGovernedHint")}
            </p>

            <a
              href="/en/governance"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-cyan-300 hover:underline"
            >
              {t("interactorGovernanceOpen")}
              <ExternalLink className="h-3 w-3" />
            </a>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}