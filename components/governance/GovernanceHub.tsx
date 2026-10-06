"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Loader2,
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Wallet,
  Fingerprint,
  RefreshCw,
} from "lucide-react";
import { useSupraWallet } from "@/context/SupraWalletContext";
import { useGovernanceAudit, EOA_SECURITY_STATUS, type GovernanceVerdict, type LifecycleStage } from "@/hooks/features/governance/useGovernanceAudit";
import { LifecycleRunner } from "@/components/governance/LifecycleRunner";
import { GOVERNANCE_ENTRIES } from "@/hooks/features/governance/useGovernanceActions";
import { GOVERNANCE_FACTORY } from "@/config/contracts";
import { MeshBackground } from "@/components/wizard/MeshBackground";
import { normalizeAddressHex } from "@/lib/governance/offerChallenge";

const FACTORY_NOT_PUBLISHED = GOVERNANCE_FACTORY === "0x1";

/**
 * The four on-chain control states. Each one gets its own committed color and voice because the
 * whole point of this surface is telling them apart at a glance.
 */
const STATUS_META = {
  [EOA_SECURITY_STATUS.UNMANAGED]: {
    icon: Unlock,
    accent: "text-zinc-400",
    wash: "bg-zinc-500/10",
    edge: "border-zinc-400/25",
    glow: "",
    key: "statusUnmanaged",
  },
  [EOA_SECURITY_STATUS.PERMANENTLY_RENOUNCED]: {
    icon: Lock,
    accent: "text-emerald-400",
    wash: "bg-emerald-500/10",
    edge: "border-emerald-400/35",
    glow: "shadow-[0_0_50px_-12px_rgba(16,185,129,0.45)]",
    key: "statusRenounced",
  },
  [EOA_SECURITY_STATUS.VERIFIED_DAO_GOVERNED]: {
    icon: ShieldCheck,
    accent: "text-cyan-300",
    wash: "bg-cyan-400/10",
    edge: "border-cyan-300/35",
    glow: "shadow-[0_0_50px_-12px_rgba(34,211,238,0.4)]",
    key: "statusDaoGoverned",
  },
  [EOA_SECURITY_STATUS.HAZARD_KEY_STILL_ACTIVE]: {
    icon: ShieldAlert,
    accent: "text-rose-300",
    wash: "bg-rose-500/15",
    edge: "border-rose-400/50",
    glow: "shadow-[0_0_60px_-10px_rgba(244,63,94,0.55)]",
    key: "statusHazard",
  },
} as const;

/**
 * The copyable reference of every on-chain entry.
 *
 * Only presentation metadata lives here: the module and address of each entry are read from
 * `GOVERNANCE_ENTRIES`, which is the execution source of truth. Re-deriving them locally (the old
 * `fn.includes("authentication_key") ? "account" : "governance"` heuristic) meant adding a new entry
 * would silently label it with the wrong module.
 */
const LIFECYCLE_ACTIONS = [
  { entry: "deploy_autonomous_contract", key: "actionDeploy", args: 4 },
  { entry: "donate_eoa_to_dao", key: "actionDonate", args: 5 },
  { entry: "rotate_authentication_key_call", key: "actionBurn", args: 1 },
  { entry: "upgrade_contract", key: "actionUpgrade", args: 4 },
  { entry: "transfer_admin", key: "actionTransfer", args: 3 },
  { entry: "renounce_resource_account", key: "actionDeepFreeze", args: 4 },
  { entry: "renounce_contract", key: "actionRenounce", args: 3 },
] as const;

/** Explicit map so a missing translation can never render as a raw key name at runtime. */
const STAGE_KEY: Record<LifecycleStage, string> = {
  unmanaged: "stage_unmanaged",
  dual_master: "stage_dual_master",
  governed: "stage_governed",
  frozen: "stage_frozen",
};

export function GovernanceHub() {  const t = useTranslations("Governance");
  const { rpcUrl, accounts, connect } = useSupraWallet();
  const { verdict, isAuditing, error, audit, predictResourceAccount, predictEoaProxy, reset } =
    useGovernanceAudit();

  const [target, setTarget] = useState("");
  const [prediction, setPrediction] = useState<{ ra?: string; proxy?: string }>({});
  const [copied, setCopied] = useState<string | null>(null);

  const subject = target.trim() || accounts[0] || "";
  const wallet = accounts[0] || "";

  const handleAudit = () => {
    if (!subject) return;
    // Normalize to a full 32-byte address so a short-hand input (`0xa`) audits, displays and
    // compares as the account it means.
    audit(rpcUrl, normalizeAddressHex(subject) ?? subject);
  };

  /**
   * Re-targets the audit at the connected wallet.
   *
   * Several lifecycle steps (burn, cancel) must be signed by the audited address itself, so a visitor
   * auditing some other address sees them as a read-only preview. This is the one click that makes
   * them actionable.
   */
  const handleAuditWallet = () => {
    if (!wallet) {
      connect("starkey");
      return;
    }
    setTarget(wallet);
    audit(rpcUrl, normalizeAddressHex(wallet) ?? wallet);
  };

  const handlePredict = async () => {
    if (!subject || !rpcUrl) return;
    const [ra, proxy] = await Promise.all([
      predictResourceAccount(rpcUrl, subject).catch(() => undefined),
      predictEoaProxy(rpcUrl, subject).catch(() => undefined),
    ]);
    setPrediction({ ra: ra || undefined, proxy: proxy || undefined });
  };

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <section className="relative px-4 py-8 sm:px-6 sm:py-10 max-w-6xl mx-auto w-full">
      <MeshBackground />

      {/* Masthead */}
      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-400 max-w-2xl">{t("subtitle")}</p>
      </header>

      {FACTORY_NOT_PUBLISHED && (
        <div className="mb-6 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200">{t("factoryNotPublished")}</p>
        </div>
      )}

      {/* Command bar: the one input this surface needs */}
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-1.5 flex flex-col sm:flex-row gap-1.5 shadow-2xl">
        <div className="relative flex-1">
          <Fingerprint className="w-4 h-4 text-gray-600 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAudit();
            }}
            placeholder={wallet ? t("addressPlaceholderWallet", { address: wallet }) : t("addressPlaceholder")}
            aria-label={t("auditTitle")}
            className="w-full bg-transparent pl-11 pr-4 py-3 text-sm font-mono text-white placeholder:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50 rounded-xl"
          />
        </div>
        <button
          type="button"
          onClick={handleAudit}
          disabled={isAuditing || !subject}
          className="group relative inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 px-6 py-3 text-sm font-bold text-white transition-all hover:from-emerald-300 hover:to-teal-500 hover:shadow-[0_0_30px_-6px_rgba(16,185,129,0.6)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {isAuditing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("analyzing")}
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              {t("analyze")}
            </>
          )}
        </button>
      </div>

      {!wallet && (
        <button
          type="button"
          onClick={() => connect("starkey")}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-cyan-300 focus-visible:outline-none focus-visible:underline"
        >
          <Wallet className="w-3.5 h-3.5" />
          {t("connectWallet")}
        </button>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3">
          <p className="text-xs text-rose-200">
            <span className="font-bold">{t("rpcError")}</span> {error}
          </p>
        </div>
      )}

      {/* The attestation: this is the one authored moment of the surface */}
      <AnimatePresence mode="wait">
        {verdict ? (
          <VerdictPanel key={`v-${verdict.admin}-${verdict.status}`} verdict={verdict} t={t} onReset={reset} />
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-8 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-8 sm:p-10"
          >
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 shrink-0 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{t("emptyTitle")}</h2>
                <p className="mt-1.5 text-sm text-gray-400 max-w-xl">{t("emptyHint")}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deterministic addresses */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5">
        <h2 className="text-sm font-bold text-white">{t("predictTitle")}</h2>
        <p className="mt-1 text-xs text-gray-500">{t("predictSubtitle")}</p>
        <button
          type="button"
          onClick={handlePredict}
          disabled={!subject || !rpcUrl}
          className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-gray-200 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-emerald-300/60"
        >
          {t("predict")}
        </button>
        <AnimatePresence>
          {(prediction.ra || prediction.proxy) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <dl className="mt-4 space-y-2">
                {prediction.ra && (
                  <AddressRow label={t("predictedRa")} value={prediction.ra} copied={copied} onCopy={handleCopy} />
                )}
                {prediction.proxy && (
                  <AddressRow label={t("predictedProxy")} value={prediction.proxy} copied={copied} onCopy={handleCopy} />
                )}
              </dl>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* The lifecycle itself: real, executable steps for an EOA walking the path */}
<LifecycleRunner
        verdict={verdict}
        wallet={wallet}
        rpcUrl={rpcUrl}
        onAudit={handleAudit}
        onAuditWallet={handleAuditWallet}
      />

      {/* Entry reference: what exists on-chain, not the primary interaction */}
      <details className="mt-6 group rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300/40">
          <div>
            <h2 className="text-sm font-bold text-white">{t("actionsTitle")}</h2>
            <p className="mt-1 text-xs text-gray-500">{t("actionsSubtitle")}</p>
          </div>
          <RefreshCw className="w-4 h-4 shrink-0 text-gray-600 transition-transform group-open:rotate-90" />
        </summary>
        <ul className="border-t border-white/10">
          {LIFECYCLE_ACTIONS.map((action, i) => {
            const target = GOVERNANCE_ENTRIES[action.entry];
            const signature = `${target.address}::${target.module}::${action.entry}`;
            return (
              <li key={action.entry} className={i > 0 ? "border-t border-white/5" : ""}>
                <button
                  type="button"
                  onClick={() => handleCopy(signature)}
                  aria-label={t("copySignature")}
                  className="group flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:bg-white/[0.06]"
                >
                  <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-gray-400 group-hover:text-gray-200">
                    {signature}
                  </code>
                  <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-mono text-gray-600">
                    {action.args} {t("argsLabel")}
                  </span>
                  {copied === signature ? (
                    <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-emerald-400">
                      <Check className="w-3.5 h-3.5" />
                      <span className="sr-only">{t("copied")}</span>
                    </span>
                  ) : (
                    <Copy className="w-3.5 h-3.5 shrink-0 text-gray-700 transition-colors group-hover:text-gray-400" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Attestation panel                                                    */
/* ------------------------------------------------------------------ */

function VerdictPanel({
  verdict,
  t,
  onReset,
}: {
  verdict: GovernanceVerdict;
  t: (key: string) => string;
  onReset: () => void;
}) {
  const meta = STATUS_META[verdict.status as keyof typeof STATUS_META] ?? STATUS_META[0];
  const Icon = meta.icon;
  const hazard = verdict.status === EOA_SECURITY_STATUS.HAZARD_KEY_STILL_ACTIVE;

  const proofs: { label: string; ok: boolean; warn?: boolean }[] = [
    { label: t("factImmutable"), ok: verdict.permanentlyImmutable },
    { label: t("factCryptoFrozen"), ok: verdict.cryptographicallyFrozen },
    { label: t("factKeyDead"), ok: verdict.keyAnnihilated },
    { label: t("factDonationComplete"), ok: verdict.donationComplete },
    { label: t("factAdminIsContract"), ok: verdict.adminIsContract, warn: !verdict.adminIsContract },
    { label: t("factFactoryManaged"), ok: verdict.factoryManaged, warn: !verdict.factoryManaged },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`mt-6 overflow-hidden rounded-2xl border ${meta.edge} ${meta.wash} ${meta.glow}`}
    >
      {/* Verdict header */}
      <div className="flex items-start gap-4 p-5 sm:p-6">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className={`w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl border ${meta.edge} bg-black/30 flex items-center justify-center`}
        >
          <Icon className={`w-6 h-6 sm:w-7 sm:h-7 ${meta.accent}`} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className={`text-xl sm:text-2xl font-extrabold tracking-tight ${meta.accent}`}>
            {t(meta.key)}
          </p>
          <p className="mt-1 text-xs sm:text-sm leading-relaxed text-gray-400">{t("statusHint")}</p>
          <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            {t(STAGE_KEY[verdict.stage])}
            {!verdict.factoryManaged && (
              <span className="text-amber-400/80">· {t("stageUnmanagedHint")}</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="shrink-0 text-xs text-gray-600 transition-colors hover:text-gray-300 focus-visible:outline-none focus-visible:underline"
        >
          {t("clear")}
        </button>
      </div>

      {/* Hazard callout: the one state that must not be missed */}
      {hazard && (
        <div className="border-t border-rose-400/25 px-5 sm:px-6 py-4">
          <p className="text-xs leading-relaxed text-rose-100">{t("hazardDetail")}</p>
        </div>
      )}

      {/* Proof ledger */}
      <div className="border-t border-white/10 bg-black/20 px-5 sm:px-6 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">
          {t("proofHeading")}
        </p>
        <dl className="mt-3 grid sm:grid-cols-2 gap-x-8">
          {proofs.map((p) => (
            <div
              key={p.label}
              className="flex items-center justify-between gap-3 border-b border-white/5 py-2 last:border-0 sm:[&:nth-last-child(2)]:border-b sm:[&:nth-last-child(2)]:border-white/5"
            >
              <dt className="text-xs text-gray-400">{p.label}</dt>
              <dd
                className={`font-mono text-xs font-bold ${
                  p.ok ? "text-emerald-400" : p.warn ? "text-amber-400" : "text-gray-600"
                }`}
              >
                {p.ok ? t("yes") : t("no")}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* On-chain identities */}
      {(verdict.admin || verdict.proxy) && (
        <dl className="border-t border-white/10 px-5 sm:px-6 py-4 space-y-2">
          {verdict.admin && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
              <dt className="text-[11px] uppercase tracking-wider text-gray-600 sm:w-20 shrink-0">
                {t("admin")}
              </dt>
              <dd className="font-mono text-[11px] text-gray-300 break-all">{verdict.admin}</dd>
            </div>
          )}
          {verdict.proxy && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
              <dt className="text-[11px] uppercase tracking-wider text-gray-600 sm:w-20 shrink-0">
                {t("proxy")}
              </dt>
              <dd className="font-mono text-[11px] text-gray-300 break-all">{verdict.proxy}</dd>
            </div>
          )}
        </dl>
      )}
    </motion.div>
  );
}


function AddressRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: string | null;
  onCopy: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/30 px-3 py-2">
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] uppercase tracking-wider text-gray-600">{label}</dt>
        <dd className="font-mono text-[11px] text-cyan-200/90 break-all">{value}</dd>
      </div>
      <button
        type="button"
        onClick={() => onCopy(value)}
        aria-label={label}
        className="shrink-0 rounded-md p-1.5 text-gray-600 transition-colors hover:bg-white/5 hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-cyan-300/60"
      >
        {copied === value ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export default GovernanceHub;