"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Info, Loader2, PenLine, Vote } from "lucide-react";
import { useGovernanceActions, type SignedOfferProof } from "@/hooks/features/governance/useGovernanceActions";
import { readStored, writeStored, STORAGE_KEYS } from "@/lib/storage";
import { Field, inputCls } from "./LifecycleShared";

const stepDoneCls = "border-emerald-400/50 bg-emerald-400/15 text-emerald-200";
const stepIdleCls = "border-white/15 text-gray-400";

function byteCount(hex: string | undefined): number {
  if (!hex) return 0;
  const raw = hex.replace(/^0x/, "");
  return Math.floor(raw.length / 2);
}

function formatError(e: any): string {
  if (!e) return "Unknown error";
  return e?.message || String(e);
}

function ProofRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-[10px] text-gray-500">{label}</dt>
      <dd className="font-mono text-[10px] text-gray-300 break-all">{value}</dd>
    </div>
  );
}

export function DonateForm({
  t,
  wallet,
  onDone,
}: {
  t: any;
  wallet: string;
  onDone: () => void;
}) {
  const { signOfferProof, submitDonation, isPending } = useGovernanceActions();
  const [proof, setProof] = useState<SignedOfferProof | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [admin, setAdmin] = useState("");

  useEffect(() => {
    const saved = readStored(STORAGE_KEYS.daoAdmin);
    if (saved) setAdmin(saved);
  }, []);

  const adminOk = /^0x[0-9a-fA-F]{1,64}$/.test(admin.trim()) && admin.trim() !== "0x0";
  const busy = signing || isPending("donate_eoa_to_dao");
  const canSubmit = adminOk && !!proof && !busy;

  const handleSign = async () => {
    setError(null);
    setProof(null);
    setSigning(true);
    try {
      setProof(await signOfferProof(wallet));
    } catch (e: any) {
      setError(formatError(e));
    } finally {
      setSigning(false);
    }
  };

  const handleSubmit = async () => {
    if (!proof) return;
    setError(null);
    try {
      const txHash = await submitDonation(admin.trim(), proof);
      if (txHash) onDone();
    } catch {
      /* Handled by execute */
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-sm font-bold text-white">{t("donateFormTitle")}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">{t("donateFormHint")}</p>

      <div className="mt-4 space-y-3.5">
        <Field label={t("fieldDaoAdmin")} hint={t("fieldDaoAdminHint")}>
          <input
            value={admin}
            onChange={(e) => {
              const next = e.target.value;
              setAdmin(next);
              if (next.trim() && next !== admin) {
                writeStored(STORAGE_KEYS.daoAdmin, next);
              }
            }}
            placeholder="0x…"
            spellCheck={false}
            className={inputCls}
          />
        </Field>

        <div className="flex gap-2.5 rounded-lg border border-cyan-300/20 bg-cyan-400/[0.06] px-3 py-2.5">
          <Info className="w-3.5 h-3.5 text-cyan-300 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-cyan-100/85">{t("donateOneDelegate")}</p>
        </div>

        {/* Phase 1 — sign */}
        <div
          className={`rounded-lg border p-3.5 transition-colors duration-300 ${
            proof ? "border-emerald-400/30 bg-emerald-500/[0.05]" : "border-white/10 bg-black/30"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold transition-colors duration-300 ${
                proof ? stepDoneCls : stepIdleCls
              }`}
            >
              {proof ? <Check className="w-3 h-3" /> : "1"}
            </span>
            <p className="text-xs font-bold text-gray-200">{t("donateSignStep")}</p>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-500">
              {t("donateOffchain")}
            </span>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-gray-600">{t("donateSignHint")}</p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-gray-600">{t("donateProofNote")}</p>
          {!adminOk && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-amber-200/70">{t("donateNeedAdmin")}</p>
          )}
          <button
            type="button"
            onClick={handleSign}
            disabled={busy || !adminOk}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold text-gray-100 transition-colors hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-cyan-300/50"
          >
            {signing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />}
            {signing ? t("donateSigning") : t("donateSignCta")}
          </button>

          {proof && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-2.5">
              <p className="flex items-center gap-1.5 text-[10px] leading-relaxed text-emerald-300/85">
                <Check className="w-3 h-3 shrink-0" />
                {t("donateProofValid")}
              </p>
              <dl className="space-y-1.5 border-t border-white/10 pt-3">
                <ProofRow label={t("donateSource")} value={proof.source} />
                <ProofRow label={t("donateRecipient")} value={proof.recipient} />
                <ProofRow label={t("donateSequence")} value={proof.sequenceNumber} />
                <ProofRow
                  label={`${t("donateSignature")} · ${byteCount(proof.signature)} B`}
                  value={proof.signature}
                />
                <ProofRow
                  label={`${t("donatePublicKey")} · ${byteCount(proof.publicKey)} B`}
                  value={proof.publicKey}
                />
                <details>
                  <summary className="cursor-pointer text-[10px] text-gray-600 hover:text-gray-400">
                    {t("donateSignedBytes")}
                  </summary>
                  <code className="mt-1.5 block break-all rounded bg-black/60 p-2 font-mono text-[10px] text-gray-500">
                    {proof.challengeHex}
                  </code>
                </details>
              </dl>
            </motion.div>
          )}
        </div>

        {/* Phase 2 — submit */}
        <div
          className={`rounded-lg border p-3.5 transition-all duration-300 ${
            proof
              ? "border-emerald-400/40 bg-emerald-500/[0.09] shadow-[0_0_30px_-12px_rgba(16,185,129,0.45)]"
              : "border-white/10 bg-black/30 opacity-50"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold transition-colors duration-300 ${
                proof ? stepDoneCls : stepIdleCls
              }`}
            >
              2
            </span>
            <p className="text-xs font-bold text-gray-200">{t("donateSubmitStep")}</p>
            <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
              {t("donateOneTx")}
            </span>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-gray-600">{t("donateSubmitHint")}</p>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 px-5 py-3 text-sm font-bold text-white transition-all hover:from-emerald-300 hover:to-teal-500 hover:shadow-[0_0_30px_-6px_rgba(16,185,129,0.6)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:shadow-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:w-auto"
          >
            {isPending("donate_eoa_to_dao") ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("donateSubmitting")}
              </>
            ) : (
              <>
                <Vote className="w-4 h-4" />
                {t("donateSubmitCta")}
              </>
            )}
          </button>
        </div>

        {error && (
          <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-100">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
