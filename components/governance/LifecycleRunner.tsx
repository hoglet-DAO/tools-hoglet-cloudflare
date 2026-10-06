"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  Rocket,
  ArrowUpCircle,
  Snowflake,
  Lock,
  Loader2,
  FolderOpen,
  Check,
  AlertTriangle,
  PenLine,
  Vote,
} from "lucide-react";
import { useGovernanceActions, type SignedOfferProof } from "@/hooks/features/governance/useGovernanceActions";
import { BurnKeyForm } from "@/components/governance/BurnKeyForm";
import { CancelDelegationForm } from "@/components/governance/CancelDelegationForm";
import { sameAddress } from "@/lib/governance/offerChallenge";
import type { GovernanceVerdict, LifecycleStage } from "@/hooks/features/governance/useGovernanceAudit";
import { GOVERNANCE_FACTORY } from "@/config/contracts";
import {
  readFileAsHex,
  isUsableHex,
  filterBuildFiles,
  formatBytes,
} from "@/lib/governance/buildArtifacts";

/**
 * Runs the governance lifecycle end to end for a single EOA: deploy, upgrade, hand over, freeze.
 *
 * Every entry goes through `useGovernanceActions.execute`, so the whole lifecycle shares one
 * serialization route, one error translation and one success surface. After a confirmed transaction
 * the audit is re-run on purpose: the derived lifecycle stage is what advances the machine, so the UI
 * can never claim a step the chain has not actually accepted.
 */
export function LifecycleRunner({
  verdict,
  wallet,
  rpcUrl,
  onAudit,
  onAuditWallet,
}: {
  verdict: GovernanceVerdict | null;
  wallet: string;
  rpcUrl: string;
  onAudit: () => void;
  /** Re-audits the connected wallet, which is what makes owner-signed steps actionable. */
  onAuditWallet: () => void;
}) {
  const t = useTranslations("Governance");
  const { execute, isPending } = useGovernanceActions();
  const [notice, setNotice] = useState<string | null>(null);

  const stage: LifecycleStage = verdict?.stage ?? "unmanaged";

  // Re-audit only after a transaction actually went out, so the stage reflects the chain rather than
  // optimism: a declined prompt returns no hash and changes nothing on-chain.
  const run = async (entry: Parameters<typeof execute>[0], args: any[]) => {
    setNotice(null);
    try {
      const txHash = await execute(entry, { args });
      if (txHash) onAudit();
    } catch {
      /* execute() already surfaced the error */
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
            icon={Rocket}
            title={t("stage_unmanaged")}
            body={t("runnerUnmanagedBody")}
            tone="text-gray-300"
          />
          <DeployForm t={t} isPending={isPending("deploy_autonomous_contract")} run={run} />
          <DonateForm t={t} wallet={wallet} onDone={onAudit} />

          {/* Path 2 of the architecture: self-renounce with no DAO in the loop. Burning the key
              while no capability offer is active is pure framework state, so it is available to any
              EOA the visitor owns — it does not require a factory record first. */}
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
              onAuditWallet={onAuditWallet}
            />
          </div>
        </div>
      )}

      {stage === "dual_master" && (
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
            onAuditWallet={onAuditWallet}
          />
          {/* The safety valve: a donation is only reversible while the key is alive, so the undo sits
              right beside the commit. After the burn it can never be offered again. */}
          <CancelDelegationForm subject={verdict?.subject ?? ""} wallet={wallet} onDone={onAudit} />
        </div>
      )}

      {stage === "governed" && (
        <div className="space-y-5">
          <StageHeader
            icon={ArrowUpCircle}
            title={t("stage_governed")}
            body={t("runnerGovernedBody")}
            tone="text-cyan-300"
          />
          <UpgradeForm t={t} isPending={isPending("upgrade_contract")} run={run} contract={verdict!.subject} />
          <TransferAdminForm t={t} isPending={isPending("transfer_admin")} run={run} contract={verdict!.subject} />
          <DeepFreezeForm
            t={t}
            isPending={isPending("renounce_resource_account")}
            run={run}
            contract={verdict!.subject}
          />
          <RenounceForm t={t} isPending={isPending("renounce_contract")} run={run} contract={verdict!.subject} />
        </div>
      )}

      {stage === "frozen" && (
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 shrink-0 rounded-xl border border-emerald-400/40 bg-emerald-500/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-lg font-extrabold text-emerald-300">{t("stage_frozen")}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">{t("runnerFrozenBody")}</p>
          </div>
        </div>
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Frame                                                               */
/* ------------------------------------------------------------------ */

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 sm:p-6">{children}</div>;
}

function StageHeader({
  icon: Icon,
  title,
  body,
  tone,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
  tone: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-11 h-11 shrink-0 rounded-xl border border-white/10 bg-black/30 flex items-center justify-center">
        <Icon className={`w-5 h-5 ${tone}`} />
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-bold ${tone}`}>{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">{body}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stage 1 — deploy                                                    */
/* ------------------------------------------------------------------ */

function DeployForm({
  t,
  isPending,
  run,
}: {
  t: any;
  isPending: boolean;
  run: (entry: any, args: any[]) => Promise<void>;
}) {
  const [admin, setAdmin] = useState("");
  const [metadata, setMetadata] = useState("");
  const [modules, setModules] = useState<{ name: string; hex: string; size: number }[]>([]);

  const adminOk = /^0x[0-9a-fA-F]{1,64}$/.test(admin.trim()) && admin.trim() !== "0x0";
  const ready = adminOk && isUsableHex(metadata) && modules.length > 0;

  return (
    <Form
      title={t("deployFormTitle")}
      hint={t("deployFormHint")}
      ready={ready}
      pending={isPending}
      cta={t("deployFormCta")}
      onSubmit={() => run("deploy_autonomous_contract", [metadata, modules.map((m) => m.hex), admin.trim()])}
    >
      <Field label={t("fieldDaoAdmin")} hint={t("fieldDaoAdminHint")}>
        <input
          value={admin}
          onChange={(e) => setAdmin(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
          className={inputCls}
        />
      </Field>

      <ArtifactPicker
        t={t}
        accept=".bcs"
        multiple={false}
        label={t("fieldMetadata")}
        hint={t("fieldMetadataHint")}
        onPick={async (files) => {
          const f = files[0];
          setMetadata(await readFileAsHex(f));
        }}
      />

      <ArtifactPicker
        t={t}
        accept=".mv"
        multiple
        label={t("fieldBytecode")}
        hint={t("fieldBytecodeHint")}
        onPick={async (files) => {
          const picked = filterBuildFiles(files, "mv");
          const decoded = await Promise.all(
            picked.map(async (f) => ({ name: f.name, hex: await readFileAsHex(f), size: f.size }))
          );
          setModules(decoded);
        }}
      />
    </Form>
  );
}

/* ------------------------------------------------------------------ */
/* Stage 1 — donate: sign the delegation proof, then submit it        */
/* ------------------------------------------------------------------ */

function DonateForm({ t, wallet, onDone }: { t: any; wallet: string; onDone: () => void }) {
  const { signOfferProof, submitDonation, isPending } = useGovernanceActions();
  const [admin, setAdmin] = useState("");
  const [proof, setProof] = useState<SignedOfferProof | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // Only re-audit when the transaction actually went out; a declined prompt changes nothing.
      if (txHash) onDone();
    } catch {
      /* execute() surfaced it */
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
              setAdmin(e.target.value);
              setProof(null); // a new admin invalidates nothing cryptographically, but force a re-read
            }}
            placeholder="0x…"
            spellCheck={false}
            className={inputCls}
          />
        </Field>

        {/* Phase 1 — sign */}
        <div className="rounded-lg border border-white/10 bg-black/30 p-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/15 text-[10px] font-bold text-gray-400">
              1
            </span>
            <p className="text-xs font-bold text-gray-200">{t("donateSignStep")}</p>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-500">
              {t("donateOffchain")}
            </span>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-gray-600">{t("donateSignHint")}</p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-gray-600">{t("donateProofNote")}</p>
          <button
            type="button"
            onClick={handleSign}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold text-gray-100 transition-colors hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-cyan-300/50"
          >
            {signing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />}
            {signing ? t("donateSigning") : t("donateSignCta")}
          </button>

          {proof && (
            <motion.dl
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 space-y-1.5 border-t border-white/10 pt-3"
            >
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
            </motion.dl>
          )}
        </div>

        {/* Phase 2 — submit */}
        <div
          className={`rounded-lg border p-3.5 ${
            proof ? "border-emerald-400/25 bg-emerald-500/[0.06]" : "border-white/10 bg-black/30 opacity-50"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/15 text-[10px] font-bold text-gray-400">
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

function ProofRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-28 shrink-0 text-[10px] uppercase tracking-wider text-gray-600">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-[10px] text-cyan-200/80">{value || "—"}</dd>
    </div>
  );
}

/** `0x…` hex length to bytes, so an empty or truncated value is obvious at a glance. */
function byteCount(hex: string | undefined): number {
  if (!hex) return 0;
  return Math.max(0, hex.replace(/^0x/, "").length / 2);
}

function formatError(e: any): string {
  const message = e?.message || String(e);
  if (/invalid.signature|EINVALID_PROOF_OF_KNOWLEDGE|0x1[0-9a-f]*::.*/i.test(message)) {
    return message;
  }
  return message;
}

/* ------------------------------------------------------------------ */
/* Stage 1 — reference for the deploy step's bytecode selection        */
/* ------------------------------------------------------------------ */

function UpgradeForm({
  t,
  isPending,
  run,
  contract,
}: {
  t: any;
  isPending: boolean;
  run: (entry: any, args: any[]) => Promise<void>;
  contract: string;
}) {
  const [metadata, setMetadata] = useState("");
  const [modules, setModules] = useState<{ name: string; hex: string; size: number }[]>([]);
  const ready = isUsableHex(metadata) && modules.length > 0;

  return (
    <Form
      title={t("upgradeFormTitle")}
      hint={t("upgradeFormHint", { address: contract })}
      ready={ready}
      pending={isPending}
      cta={t("upgradeFormCta")}
      onSubmit={() => run("upgrade_contract", [contract, metadata, modules.map((m) => m.hex)])}
    >
      <ArtifactPicker
        t={t}
        accept=".bcs"
        multiple={false}
        label={t("fieldMetadata")}
        hint={t("fieldMetadataHint")}
        onPick={async (files) => setMetadata(await readFileAsHex(files[0]))}
      />
      <ArtifactPicker
        t={t}
        accept=".mv"
        multiple
        label={t("fieldBytecode")}
        hint={t("fieldBytecodeHint")}
        onPick={async (files) => {
          const picked = filterBuildFiles(files, "mv");
          setModules(
            await Promise.all(
              picked.map(async (f) => ({ name: f.name, hex: await readFileAsHex(f), size: f.size }))
            )
          );
        }}
      />
    </Form>
  );
}

function TransferAdminForm({
  t,
  isPending,
  run,
  contract,
}: {
  t: any;
  isPending: boolean;
  run: (entry: any, args: any[]) => Promise<void>;
  contract: string;
}) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const addrOk = /^0x[0-9a-fA-F]{1,64}$/.test(next.trim()) && next.trim() !== "0x0";
  const ready = addrOk && sameAddress(confirm.trim(), next.trim());

  return (
    <Form
      title={t("transferFormTitle")}
      hint={t("transferFormHint")}
      ready={ready}
      pending={isPending}
      cta={t("transferFormCta")}
      onSubmit={() => run("transfer_admin", [contract, next.trim()])}
    >
      <Field label={t("fieldNewAdmin")} hint={t("fieldNewAdminHint")}>
        <input value={next} onChange={(e) => setNext(e.target.value)} placeholder="0x…" spellCheck={false} className={inputCls} />
      </Field>
      <Field label={t("transferFormConfirmLabel", { address: next || "0x…" })}>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={next || "0x…"} spellCheck={false} className={inputCls} />
      </Field>
      <Warning>{t("transferFormWarning")}</Warning>
    </Form>
  );
}

function DeepFreezeForm({
  t,
  isPending,
  run,
  contract,
}: {
  t: any;
  isPending: boolean;
  run: (entry: any, args: any[]) => Promise<void>;
  contract: string;
}) {
  const [ack, setAck] = useState(false);
  const [metadata, setMetadata] = useState("");
  const [modules, setModules] = useState<{ name: string; hex: string; size: number }[]>([]);
  const ready = ack && isUsableHex(metadata) && modules.length > 0;

  return (
    <Form
      title={t("deepFreezeFormTitle")}
      hint={t("deepFreezeFormHint", { address: contract })}
      ready={ready}
      pending={isPending}
      cta={t("deepFreezeFormCta")}
      tone="rose"
      onSubmit={() =>
        run("renounce_resource_account", [contract, metadata, modules.map((m) => m.hex)])
      }
    >
      <Warning>{t("deepFreezeFormWarning")}</Warning>
      <ArtifactPicker
        t={t}
        accept=".bcs"
        multiple={false}
        label={t("fieldFinalMetadata")}
        hint={t("fieldMetadataHint")}
        onPick={async (files) => setMetadata(await readFileAsHex(files[0]))}
      />
      <ArtifactPicker
        t={t}
        accept=".mv"
        multiple
        label={t("fieldFinalBytecode")}
        hint={t("fieldBytecodeHint")}
        onPick={async (files) => {
          const picked = filterBuildFiles(files, "mv");
          setModules(
            await Promise.all(
              picked.map(async (f) => ({ name: f.name, hex: await readFileAsHex(f), size: f.size }))
            )
          );
        }}
      />
      <label className="flex cursor-pointer items-start gap-3 select-none">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
          className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-rose-500"
        />
        <span className="text-xs leading-relaxed text-gray-300">{t("deepFreezeFormAck")}</span>
      </label>
    </Form>
  );
}

function RenounceForm({
  t,
  isPending,
  run,
  contract,
}: {
  t: any;
  isPending: boolean;
  run: (entry: any, args: any[]) => Promise<void>;
  contract: string;
}) {
  const [typed, setTyped] = useState("");
  const ready = typed.trim() !== "" && sameAddress(typed.trim(), contract);

  return (
    <Form
      title={t("renounceFormTitle")}
      hint={t("renounceFormHint", { address: contract })}
      ready={ready}
      pending={isPending}
      cta={t("renounceFormCta")}
      tone="rose"
      onSubmit={() => run("renounce_contract", [contract, []])}
    >
      <Warning>{t("renounceFormWarning")}</Warning>
      <Field label={t("renounceFormConfirmLabel", { address: contract })}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={contract} spellCheck={false} className={inputCls} />
      </Field>
    </Form>
  );
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

const inputCls =
  "w-full rounded-lg border border-white/10 bg-black/50 px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-gray-700 focus:border-cyan-300/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] text-gray-400">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-[10px] leading-relaxed text-gray-600">{hint}</p>}
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-amber-400/25 bg-amber-500/[0.08] px-3.5 py-3">
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <p className="text-[11px] leading-relaxed text-amber-100/85">{children}</p>
    </div>
  );
}

function ArtifactPicker({
  t,
  accept,
  multiple,
  label,
  hint,
  onPick,
}: {
  t: any;
  accept: string;
  multiple: boolean;
  label: string;
  hint?: string;
  onPick: (files: File[]) => Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);

  return (
    <Field label={label} hint={hint}>
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-white/15 bg-black/30 px-3.5 py-3 transition-colors hover:border-cyan-300/40 hover:bg-black/50 focus-within:ring-2 focus-within:ring-cyan-300/40">
        <FolderOpen className="w-4 h-4 text-gray-500 shrink-0" />
        <span className="text-xs text-gray-400 truncate">
          {files.length === 0
            ? t("pickerIdle")
            : files.length === 1
              ? `${files[0].name} · ${formatBytes(files[0].size)}`
              : t("pickerMany", { count: files.length, size: formatBytes(files.reduce((a, f) => a + f.size, 0)) })}
        </span>
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={async (e) => {
            const picked = Array.from(e.target.files ?? []);
            if (!picked.length) return;
            setFiles(picked);
            await onPick(picked);
          }}
        />
      </label>
    </Field>
  );
}

function Form({
  title,
  hint,
  ready,
  pending,
  cta,
  tone = "emerald",
  onSubmit,
  children,
}: {
  title: string;
  hint: string;
  ready: boolean;
  pending: boolean;
  cta: string;
  tone?: "emerald" | "rose";
  onSubmit: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border bg-black/20 p-4 ${
        tone === "rose" ? "border-rose-400/20" : "border-white/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500 break-all">{hint}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3.5">{children}</div>

      <button
        type="button"
        disabled={!ready || pending}
        onClick={onSubmit}
        className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-35 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:w-auto ${
          tone === "rose"
            ? "bg-gradient-to-br from-rose-500 to-red-700 hover:from-rose-400 hover:to-red-600 disabled:hover:shadow-none"
            : "bg-gradient-to-br from-emerald-400 to-teal-600 hover:from-emerald-300 hover:to-teal-500"
        } ${tone === "rose" ? "hover:shadow-[0_0_30px_-6px_rgba(244,63,94,0.7)]" : "hover:shadow-[0_0_30px_-6px_rgba(16,185,129,0.6)]"}`}
      >
        {pending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {cta}…
          </>
        ) : (
          <>
            {tone === "rose" ? <Snowflake className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            {cta}
          </>
        )}
      </button>
    </motion.div>
  );
}

export default LifecycleRunner;