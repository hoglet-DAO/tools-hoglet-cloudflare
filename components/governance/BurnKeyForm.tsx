"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { KeyRound, AlertTriangle, Loader2, Check, Info, RefreshCw, Flame } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGovernanceActions } from "@/hooks/features/governance/useGovernanceActions";
import { sameAddress } from "@/lib/governance/offerChallenge";

/**
 * The only lifecycle step the factory cannot perform on the owner's behalf.
 *
 * `account::rotate_authentication_key_call` is declared `entry` (not `public`) in the framework, so
 * Move forbids calling it from any other module — including dao_contracts_vault. The key owner has to
 * send this transaction directly, which is exactly why it lives in the UI instead of inside the vault.
 * Everything else in the lifecycle (deploy, offer, revoke) is orchestrated by the contract because
 * those framework functions are `public`.
 *
 * Because the effect is total and permanent — the address becomes unable to sign anything, forever —
 * the deliberate act is separated from the explanation: the panel informs and takes two explicit
 * acknowledgements, and the destructive confirmation itself happens behind a modal that also demands
 * the address be typed out.
 */

/** `supra_framework::account` — the module that declares the rotation entry. */
const FRAMEWORK_ACCOUNT = "0x1";
const BURN_FUNCTION = "rotate_authentication_key_call";

export function BurnKeyForm({
  subject,
  wallet,
  onSigned,
  offerRedirected = false,
  offerTarget = "",
  expectedProxy = "",
}: {
  /** The audited address. The burn is only offered when it is the connected wallet. */
  subject: string;
  wallet: string;
  onSigned: () => void;
  /** The delegation points somewhere other than the factory's own proxy. */
  offerRedirected?: boolean;
  /** Where the delegation currently points, shown so the redirect is actionable. */
  offerTarget?: string;
  /** The proxy this factory expects, shown next to the real recipient. */
  expectedProxy?: string;
}) {
  const t = useTranslations("Governance");
  const { burnPrivateKey, isPending } = useGovernanceActions();

  const [swept, setSwept] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const isOwner = sameAddress(wallet, subject);
  /**
   * Refuse the burn outright when the delegation has been redirected.
   *
   * This is the one irreversible action on the whole surface, and the redirect case is exactly where
   * it does the most damage: `cancel_eoa_delegation` requires a live authentication key
   * (`E_DELEGATION_COMMITTED`), so once the key is zeroed the current holder of the offer owns the
   * account permanently and nobody — not the owner, not the DAO, not this factory — can revoke it.
   * Blocking here is the whole point of detecting the redirect at all; a warning the user can click
   * past would be worthless against an action with no undo.
   */
  if (offerRedirected) {
    return (
      <div className="rounded-xl border border-rose-400/40 bg-rose-500/[0.08] p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-rose-200">{t("burnBlockedTitle")}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-rose-100/85">{t("burnBlockedBody")}</p>
            <dl className="mt-3 space-y-1.5">
              <div className="flex items-baseline gap-3">
                <dt className="w-32 shrink-0 text-[10px] uppercase tracking-wider text-rose-200/60">
                  {t("burnExpectedProxy")}
                </dt>
                <dd className="min-w-0 break-all font-mono text-[10px] text-rose-100/80">{expectedProxy || "-"}</dd>
              </div>
              <div className="flex items-baseline gap-3">
                <dt className="w-32 shrink-0 text-[10px] uppercase tracking-wider text-rose-200/60">
                  {t("burnActualOffer")}
                </dt>
                <dd className="min-w-0 break-all font-mono text-[10px] font-bold text-rose-300">
                  {offerTarget || "-"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-rose-100/70">{t("burnBlockedHint")}</p>
          </div>
        </div>
      </div>
    );
  }
  /**
   * `rotate_authentication_key_call` is `entry`, not `public`, so Move forbids the factory from
   * calling it: the burn is only ever signed by the address that owns the key. That makes "not my
   * key" a dead end rather than a different screen, so there is no preview mode here — a previous
   * one only re-targeted the audit at the connected wallet, which the command bar above already
   * does with the same effect.
   */
  const acknowledges = swept && understood;
  const typedMatches = wallet !== "" && sameAddress(typed.trim(), wallet);
  const busy = isPending("rotate_authentication_key_call");

  // Not your key: say so plainly instead of offering an action that cannot work for you.
  if (!isOwner) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-bold text-white">{t("burnTitle")}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">{t("burnOwnerOnly")}</p>
      </div>
    );
  }

  /**
   * Deliberately does NOT re-audit on its own: a freshly submitted transaction may not be reflected
   * in a read yet, and showing the pre-burn state would invite a second, failing burn. The receipt
   * stays until the operator asks for the new state.
   */
  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 p-4"
      >
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 shrink-0 rounded-xl border border-emerald-400/40 bg-black/30 flex items-center justify-center">
            <Check className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-extrabold text-emerald-300">{t("burnDoneTitle")}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{t("burnDoneHint")}</p>
            <p className="mt-2.5 break-all font-mono text-[10px] text-gray-500">tx {done}</p>
            <button
              type="button"
              onClick={() => {
                setDone(null);
                setSwept(false);
                setUnderstood(false);
                setTyped("");
                onSigned();
              }}
              title={t("burnReauditHint")}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-gray-100 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-emerald-300/50"
            >
              <RefreshCw className="w-3 h-3" />
              {t("burnReaudit")}
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  const handleBurn = async () => {
    setError(null);
    try {
      const txHash = await burnPrivateKey();
      // No hash means the prompt was declined. Keep the modal open for a retry and let the shared
      // warning toast explain — rendering the "done" receipt here would claim a burn that never
      // happened, which is the worst possible false positive for this action.
      if (!txHash) return;
      setOpen(false);
      setDone(txHash);
    } catch (e: any) {
      // The inline error is the only failure feedback for this action: the shared toast is
      // suppressed (silentFailure) so the same failure is not announced twice.
      setError(e?.message || t("burnFailed"));
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-xl border border-rose-400/35 bg-rose-500/[0.06]"
      >
        {/* Why this one lives here and not in the contract */}
        <div className="flex items-start gap-4 p-4">
          <div className="w-10 h-10 shrink-0 rounded-xl border border-rose-400/35 bg-black/30 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-rose-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-extrabold tracking-tight text-rose-200">{t("burnTitle")}</p>
            <code className="mt-1 block break-all font-mono text-[11px] text-rose-200/60">
              {FRAMEWORK_ACCOUNT}::account::{BURN_FUNCTION}(ZERO_AUTH_KEY)
            </code>
          </div>
          </div>

        <div className="border-t border-rose-400/20 px-4 py-3.5">
          <div className="flex gap-2.5 rounded-lg border border-cyan-300/20 bg-cyan-400/[0.06] px-3 py-2.5">
            <Info className="w-3.5 h-3.5 text-cyan-300 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-cyan-100/85">{t("burnFrameworkOnly")}</p>
          </div>
        </div>

        {/* Acknowledgements */}
        <div className="border-t border-white/10 bg-black/20 px-4 py-3.5 space-y-3">
          <Gate checked={swept} onChange={setSwept} label={t("burnGateSwept")} />
          <Gate checked={understood} onChange={setUnderstood} label={t("burnGateUnderstood")} />

          <button
            type="button"
            disabled={!acknowledges || busy}
            onClick={() => {
              setTyped("");
              setError(null);
              setOpen(true);
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-rose-500 to-red-700 px-5 py-3 text-sm font-bold text-white transition-all hover:from-rose-400 hover:to-red-600 hover:shadow-[0_0_30px_-6px_rgba(244,63,94,0.7)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:shadow-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:w-auto"
          >
            <KeyRound className="w-4 h-4" />
            {t("burnCta")}
          </button>
          {/* Say why it is disabled instead of letting the click vanish. */}
          {!acknowledges && (
            <p className="text-[10px] leading-relaxed text-gray-500">{t("burnGatesHint")}</p>
          )}
        </div>
      </motion.div>

      {/* The deliberate act. A modal is warranted here and nowhere else on this surface: the effect
          is total, permanent and irreversible, so it earns protected focus. */}
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="max-w-lg border-rose-400/40 bg-[#0B0D17] text-gray-200 shadow-[0_0_80px_-20px_rgba(244,63,94,0.6)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-rose-200">
              <Flame className="w-5 h-5 text-rose-400" />
              {t("burnModalTitle")}
            </DialogTitle>
            <DialogDescription className="pt-2 text-xs leading-relaxed text-gray-400">
              {t("burnBody")}
            </DialogDescription>
          </DialogHeader>

          {/* What is about to be destroyed */}
          <dl className="space-y-2 rounded-lg border border-white/10 bg-black/40 p-3.5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
              <dt className="shrink-0 text-[10px] uppercase tracking-wider text-gray-600 sm:w-20">
                {t("burnSource")}
              </dt>
              <dd className="break-all font-mono text-[11px] text-gray-300">{wallet}</dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
              <dt className="shrink-0 text-[10px] uppercase tracking-wider text-gray-600 sm:w-20">
                {t("burnCall")}
              </dt>
              <dd className="break-all font-mono text-[11px] text-gray-300">
                {FRAMEWORK_ACCOUNT}::account::{BURN_FUNCTION}(ZERO_AUTH_KEY)
              </dd>
            </div>
          </dl>

          <div className="flex gap-2.5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3.5 py-3">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-rose-100/85">{t("burnAssetWarning")}</p>
          </div>

          <div>
            <label htmlFor="burn-modal-confirm" className="block text-[11px] text-gray-400">
              {t("burnConfirmLabel", { address: wallet })}
            </label>
            <input
              id="burn-modal-confirm"
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={wallet}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-gray-700 focus:border-rose-400/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/40"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-100">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-bold text-gray-200 transition-colors hover:bg-white/10 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-cyan-300/50"
            >
              {t("burnCancel")}
            </button>
            <button
              type="button"
              disabled={!typedMatches || busy}
              onClick={handleBurn}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-rose-500 to-red-700 px-5 py-2.5 text-xs font-bold text-white transition-all hover:from-rose-400 hover:to-red-600 hover:shadow-[0_0_30px_-6px_rgba(244,63,94,0.7)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:shadow-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0D17]"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("burnBusy")}
                </>
              ) : (
                <>
                  <Flame className="w-4 h-4" />
                  {t("burnConfirmCta")}
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Gate({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 select-none">
      <span className="relative mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={`absolute inset-0 rounded-[5px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black ${
            checked ? "border-rose-400 bg-rose-500" : "border-white/20 bg-black/40"
          } peer-focus-visible:ring-rose-300/60`}
        />
        <Check
          className={`relative h-3 w-3 text-white transition-opacity ${checked ? "opacity-100" : "opacity-0"}`}
        />
      </span>
      <span className="text-xs leading-relaxed text-gray-300">{label}</span>
    </label>
  );
}

export default BurnKeyForm;