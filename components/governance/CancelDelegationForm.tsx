"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Undo2, Loader2, Check, Info, RefreshCw } from "lucide-react";
import { useGovernanceActions } from "@/hooks/features/governance/useGovernanceActions";
import { sameAddress } from "@/lib/governance/offerChallenge";

/**
 * The recovery path for a donation.
 *
 * `donate_eoa_to_dao` binds the EOA to a DAO admin and hands its capability to the proxy. If the
 * admin was wrong, or the donation was sent from the wrong wallet, this undoes it — but only while
 * the private key is still alive, because revoking the offers requires the owner's signature.
 *
 * Unlike the burn, this is not a one-way door: once cancelled the EOA can be donated again, which is
 * why it only asks for a deliberate click rather than the full acknowledgement ceremony.
 */
export function CancelDelegationForm({
  subject,
  wallet,
  onDone,
}: {
  /** The audited address. Only its owner can cancel. */
  subject: string;
  wallet: string;
  onDone: () => void;
}) {
  const t = useTranslations("Governance");
  const { cancelDelegation, isPending } = useGovernanceActions();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOwner = sameAddress(wallet, subject);
  const busy = isPending("cancel_eoa_delegation");

  if (!isOwner) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-bold text-white">{t("cancelDelegationTitle")}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">{t("cancelDelegationOwnerOnly")}</p>
      </div>
    );
  }

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-cyan-300/30 bg-cyan-400/[0.07] p-4"
      >
        <div className="flex items-start gap-3">
          <Check className="w-5 h-5 text-cyan-300 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-cyan-200">{t("cancelDelegationDoneTitle")}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{t("cancelDelegationDoneHint")}</p>
            {/* The receipt carries the hash: it is the only proof that the revoke was broadcast. */}
            <p className="mt-2 break-all font-mono text-[10px] text-gray-500">tx {done}</p>
            {/* Still offered because the re-audit on submit can land before the chain reflects the
                revoke: this form only unmounts once the read reports `unmanaged`, so when you are
                still looking at it, the state has not caught up yet and a second read can help. */}
            <button
              type="button"
              onClick={() => {
                // The receipt has served its purpose. The stage this form lives in
                // (`dual_master`) is derived from the chain, so re-auditing unmounts it.
                setDone(null);
                setConfirming(false);
                onDone();
              }}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-gray-100 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300/50"
            >
              <RefreshCw className="w-3 h-3" />
              {t("burnReaudit")}
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-sm font-bold text-white">{t("cancelDelegationTitle")}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">{t("cancelDelegationBody")}</p>

      <div className="mt-3 flex gap-2.5 rounded-lg border border-cyan-300/20 bg-cyan-400/[0.06] px-3 py-2.5">
        <Info className="w-3.5 h-3.5 text-cyan-300 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed text-cyan-100/85">{t("cancelDelegationWindow")}</p>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-100">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setError(null);
                try {
                  const txHash = await cancelDelegation(subject);
                  // No hash means the prompt was declined: the shared warning toast covers it, and
                  // showing the receipt here would claim a revocation that never happened.
                  if (!txHash) return;
                  // Receipt first, then re-audit — same order as the donation form, so undoing a
                  // donation updates the panel the way making one does. If the chain has not caught up
                  // yet, `dual_master` still holds and the receipt stays visible with its refresh
                  // action; once it does, this form unmounts and the donate form takes its place.
                  setDone(txHash);
                  onDone();
                } catch (e: any) {
                  setError(e?.message || t("cancelDelegationFailed"));
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/40 bg-cyan-400/15 px-4 py-2 text-xs font-bold text-cyan-100 transition-colors hover:bg-cyan-400/25 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-cyan-300/50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
              {busy ? t("cancelDelegationBusy") : t("cancelDelegationConfirm")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="text-[11px] text-gray-500 transition-colors hover:text-gray-300 focus-visible:outline-none focus-visible:underline"
            >
              {t("burnCancel")}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-gray-200 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300/50"
          >
            <Undo2 className="w-3.5 h-3.5" />
            {t("cancelDelegationCta")}
          </button>
        )}
      </div>
    </div>
  );
}

export default CancelDelegationForm;