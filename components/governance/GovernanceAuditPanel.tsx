"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Fingerprint,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useGovernanceAuditContext } from "@/components/governance/GovernanceAuditContext";
import { sameAddress } from "@/lib/governance/offerChallenge";
import { type GovernanceMode } from "@/components/governance/LifecycleRunner";
import {
  EOA_SECURITY_STATUS,
  type GovernanceVerdict,
} from "@/hooks/features/governance/useGovernanceAudit";
import { STATUS_META, STAGE_KEY } from "./statusMeta";

/**
 * The read-only half of the governance surface: paste an address, learn who controls it.
 *
 * Deliberately action-free. Every write in this suite is irreversible in at least one path, and the
 * two runners (Contract Governance, Account Control) offer different ones — so this panel can be
 * mounted anywhere, including a route that exists only to answer the question.
 *
 * Note what this can and cannot tell you: the eleven views all address one deployed factory, so a
 * "no factory record" verdict means "this factory does not know it", never "nobody controls it". The
 * empty-state copy says so explicitly for that reason.
 */
export function GovernanceAuditPanel({ mode }: { mode: GovernanceMode }) {
  const t = useTranslations("Governance");
  const {
    verdict,
    isAuditing,
    error,
    audit,
    subject,
    target,
    setTarget,
    wallet,
    rpcUrl,
    connect,
    copied,
    handleCopy,
  } = useGovernanceAuditContext();

  return (
    <>
      {mode === "accounts" ? (
        /*
         * Minimal variant, and deliberately not a search bar.
         *
         * Every write on this surface is signed by the connected wallet, and each one asserts
         * `sameAddress(wallet, subject)` first — burn, cancel and donate are all owner-only. So there is
         * no address here that would unlock anything: searching a foreign address produces a verdict
         * whose every action is then blocked. The only meaningful subject is the connected account, so
         * the input would be decorative and reading as a second copy of what the panel already shows.
         */
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl px-4 py-3">
          <Fingerprint className="w-4 h-4 shrink-0 text-gray-600" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {t("connectedWallet")}
            </p>
            <p className="truncate font-mono text-[13px] text-white">
              {wallet || t("walletNotConnected")}
            </p>
          </div>
          {isAuditing && <Loader2 className="w-4 h-4 shrink-0 animate-spin text-emerald-400" />}
        </div>
      ) : (
        <>
          {/* Command bar. Kept on Contract Governance because here the subject is genuinely an
              arbitrary address: the module to upgrade is a derived Resource Account, and the
              transaction is signed by a different wallet — the one that is its admin. */}
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-1.5 flex flex-col sm:flex-row gap-1.5 shadow-2xl">
            <div className="relative flex-1">
              <Fingerprint className="w-4 h-4 text-gray-600 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") audit();
                }}
                placeholder={wallet ? t("addressPlaceholderWallet", { address: wallet }) : t("addressPlaceholder")}
                aria-label={t("auditTitle")}
                className="w-full bg-transparent pl-11 pr-4 py-3 text-sm font-mono text-white placeholder:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50 rounded-xl"
              />
            </div>
            <button
              type="button"
              onClick={audit}
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
          <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{t("contractAuditHint")}</p>
        </>
      )}

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
          <VerdictPanel key={`v-${verdict.admin}-${verdict.status}`} verdict={verdict} t={t} onRefresh={audit} />
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-4 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-3.5"
          >
            <p className="text-[11px] leading-relaxed text-gray-500">{t("emptyHint")}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <FlowPanel mode={mode} />
    </>
  );
}

/**
 * Collapsed by default: one line with the icon, the verdict and the stage.
 *
 * The expanded block used to cost a heading, a paragraph, six proof rows and two address rows — roughly
 * the height of the action form it sits above, for information that is reference material rather than
 * the thing the visitor came to read. The verdict and the stage stay visible; the proof ledger does not.
 *
 * `hazard` forces it open: that is the one state where the detail is the point of visiting the page,
 * and hiding it behind a toggle would be the wrong kind of space saving.
 */
/**
 * Explains what the lifecycle actually does, and embeds the one address that matters on this surface.
 *
 * This replaced a "Predict addresses" panel, which had become noise twice over. On Account Control the
 * subject is always the connected wallet, so the derived proxy is a constant for the session — there is
 * nothing to predict, and a button that reads a fixed value is worse than no button. On Contract
 * Governance the same address was already on screen, inside the deploy form's compile instruction,
 * because that is where it is a build prerequisite.
 *
 * What was genuinely missing is the mechanism. A visitor can read every field on this page and still not
 * know that the factory holds a signer capability rather than the key itself, and that this is what makes
 * the handover revocable. So the space now carries the flow, and the address appears where it is used
 * rather than behind a control.
 */
function FlowPanel({ mode }: { mode: GovernanceMode }) {
  const t = useTranslations("Governance");
  const { subject, rpcUrl, predictEoaProxy, handleCopy } = useGovernanceAuditContext();
  const [proxy, setProxy] = useState("");

  useEffect(() => {
    if (mode !== "accounts" || !subject || !rpcUrl) return;
    let live = true;
    predictEoaProxy(rpcUrl, subject)
      .then((addr) => {
        if (live) setProxy(addr ?? "");
      })
      .catch(() => {
        if (live) setProxy("");
      });
    return () => {
      live = false;
    };
  }, [mode, subject, rpcUrl, predictEoaProxy]);

  const steps =
    mode === "accounts"
      ? [
          { n: 1, text: t("flowDonateStep1") },
          { n: 2, text: t("flowDonateStep2") },
          { n: 3, text: t("flowDonateStep3") },
        ]
      : [
          { n: 1, text: t("flowDeployStep1") },
          { n: 2, text: t("flowDeployStep2") },
          { n: 3, text: t("flowDeployStep3") },
        ];

  return (
    <details className="group mt-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300/40">
        <span>{mode === "accounts" ? t("flowDonateTitle") : t("flowDeployTitle")}</span>
        <ChevronDown className="w-4 h-4 shrink-0 text-gray-600 transition-transform duration-300 group-open:rotate-180" />
      </summary>

      <div className="border-t border-white/10 px-4 py-3.5">
        <ol className="space-y-2.5">
          {steps.map((s) => (
            <li key={s.n} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 text-[10px] font-bold text-gray-400">
                {s.n}
              </span>
              <p className="text-[11px] leading-relaxed text-gray-400">{s.text}</p>
            </li>
          ))}
        </ol>

        {/* The address, where the step that uses it is. Not behind a button: it is a fixed function of
            this account, and hiding it behind a control implied there was something to choose. */}
        {mode === "accounts" && proxy && (
          <div className="mt-3.5 border-t border-white/10 pt-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {t("predictedProxy")}
            </p>
            <div className="mt-1.5 flex items-center gap-2 rounded-md border border-white/10 bg-black/40 px-2 py-1.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-cyan-200/90">{proxy}</code>
              <button
                type="button"
                onClick={() => handleCopy(proxy)}
                aria-label={t("copyAddress")}
                className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200 focus-visible:ring-2 focus-visible:ring-cyan-300/50"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* The asymmetry is the whole design, so it is stated rather than left to be inferred: the
            factory can act for this account, and that ability is revocable exactly as long as the key
            exists. Burning the key does not hand anything to the factory — it removes the key itself. */}
        <p className="mt-3.5 flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-rose-100/85">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
          {mode === "accounts" ? t("flowDonateWarning") : t("flowDeployWarning")}
        </p>
      </div>
    </details>
  );
}

/** `0x1234…abcd`: enough to recognise an address without pasting 64 characters of it. */
function shortenAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function VerdictPanel({
  verdict,
  t,
  onRefresh,
}: {
  verdict: GovernanceVerdict;
  t: (key: string) => string;
  onRefresh: () => void;
}) {
  const meta = STATUS_META[verdict.status as keyof typeof STATUS_META] ?? STATUS_META[0];
  const Icon = meta.icon;
  const hazard = verdict.status === EOA_SECURITY_STATUS.HAZARD_KEY_STILL_ACTIVE;
  const { wallet } = useGovernanceAuditContext();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hazard) setOpen(true);
  }, [hazard]);

  const proofs: { label: string; ok: boolean; warn?: boolean }[] = [
    { label: t("factImmutable"), ok: verdict.permanentlyImmutable },
    { label: t("factCryptoFrozen"), ok: verdict.cryptographicallyFrozen },
    { label: t("factKeyDead"), ok: verdict.keyAnnihilated },
    // EOA-only. An autonomous Resource Account never donates a key, so showing "Control was handed over:
    // No" against it claimed a step that does not exist for it.
    ...(verdict.isEoa ? [{ label: t("factDonationComplete"), ok: verdict.donationComplete }] : []),
    { label: t("factAdminIsContract"), ok: verdict.adminIsContract, warn: !verdict.adminIsContract },
    { label: t("factFactoryManaged"), ok: verdict.factoryManaged, warn: !verdict.factoryManaged },
  ];

  const stage = (
    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
      {t(STAGE_KEY[verdict.stage])}
      {!verdict.factoryManaged && <span className="text-amber-400/80">· {t("stageUnmanagedHint")}</span>}
    </p>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`mt-4 overflow-hidden rounded-2xl border ${meta.edge} ${meta.wash} ${meta.glow}`}
    >
      {/* Always-visible summary row */}
      <div className="flex items-start gap-4 p-4 sm:px-5">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className={`w-11 h-11 shrink-0 rounded-xl border ${meta.edge} bg-black/30 flex items-center justify-center`}
        >
          <Icon className={`w-5 h-5 ${meta.accent}`} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className={`text-base sm:text-lg font-extrabold tracking-tight ${meta.accent}`}>{t(meta.key)}</p>
          {stage}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            title={t("proofHeading")}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-gray-300 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300/50"
          >
            {t("proofHeading")}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            />
          </button>
          {/*
            Re-reads the chain. This replaced a "Clear" button, which could not work: `reset` nulls the
            verdict, the auto-audit effect sees a changed subject and immediately repopulates it, so the
            empty state lasted a single frame. Refreshing is also the action that makes sense here — the
            verdict is derived from the chain, so the useful verb is to read it again, not to erase it.
          */}
          <button
            type="button"
            onClick={onRefresh}
            title={t("burnReaudit")}
            className="rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-white/5 hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-cyan-300/50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Detail, on demand */}
      {open && (
        <div className="border-t border-white/10">
          <p className="px-4 sm:px-5 pt-3.5 text-[11px] leading-relaxed text-gray-500">{t("statusHint")}</p>

          {hazard && (
            <div className="px-4 sm:px-5 pt-3">
              <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-rose-100">
                {t("hazardDetail")}
              </p>
            </div>
          )}

          <div className="px-4 sm:px-5 py-3.5">
            <dl className="grid sm:grid-cols-2 gap-x-6">
              {proofs.map((p) => (
                <div
                  key={p.label}
                  className="flex items-center justify-between gap-3 border-b border-white/5 py-1.5 last:border-0"
                >
                  <dt className="text-[11px] text-gray-400">{p.label}</dt>
                  <dd
                    className={`font-mono text-[11px] font-bold ${
                      p.ok ? "text-emerald-400" : p.warn ? "text-amber-400" : "text-gray-600"
                    }`}
                  >
                    {p.ok ? t("yes") : t("no")}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {(verdict.admin || verdict.proxy) && (
            <dl className="border-t border-white/10 px-4 sm:px-5 py-3 space-y-1.5">
              {verdict.admin && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <dt className="text-[10px] uppercase tracking-wider text-gray-600 sm:w-20 shrink-0">
                    {t("admin")}
                  </dt>
                  <dd className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-gray-300 break-all">
                    {sameAddress(verdict.admin, wallet) ? shortenAddress(verdict.admin) : verdict.admin}
                    {sameAddress(verdict.admin, wallet) && (
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                        {t("you")}
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {verdict.proxy && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <dt className="text-[10px] uppercase tracking-wider text-gray-600 sm:w-20 shrink-0">
                    {t("proxy")}
                  </dt>
                  <dd className="font-mono text-[11px] text-gray-300 break-all">{verdict.proxy}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
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