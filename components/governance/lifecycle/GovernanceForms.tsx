"use client";

import { useState } from "react";
import { MoveWorkspace } from "@/components/governance/MoveWorkspace";
import { sameAddress } from "@/lib/governance/offerChallenge";
import { readFileAsHex, isUsableHex, filterBuildFiles } from "@/lib/governance/buildArtifacts";
import { Form, SourceTabs, ArtifactPicker, Field, Warning, inputCls, ContractChip } from "./LifecycleShared";

export function UpgradeForm({
  t,
  isPending,
  run,
  contract,
  isEoa,
  wallet,
}: {
  t: any;
  isPending: boolean;
  run: (entry: any, args: any[], opts?: { successAddress?: string }) => Promise<string | null>;
  contract: string;
  isEoa: boolean;
  wallet?: string;
}) {
  const [target, setTarget] = useState(contract);
  const [metadata, setMetadata] = useState("");
  const [modules, setModules] = useState<{ name: string; hex: string; size: number }[]>([]);
  const [fromWorkspace, setFromWorkspace] = useState(false);
  const [source, setSource] = useState<"code" | "upload">("code");

  const targetMatches = !fromWorkspace || !target || sameAddress(target, contract);
  const ready = isUsableHex(metadata) && modules.length > 0 && targetMatches;

  return (
    <Form
      title={t("upgradeFormTitle")}
      hint={t("upgradeFormHint", { address: contract })}
      ready={ready}
      pending={isPending}
      cta={t("upgradeFormCta")}
      tone="emerald"
      reason={targetMatches ? undefined : t("upgradeTargetMismatch", { target, contract })}
      onSubmit={() =>
        run("upgrade_contract", [contract, metadata, modules.map((m) => m.hex)], { successAddress: contract })
      }
    >
      <ContractChip t={t} address={contract} />

      <SourceTabs
        source={source}
        onChange={(next) => {
          setSource(next);
          setFromWorkspace(false);
          setMetadata("");
          setModules([]);
        }}
        t={t}
      />

      {source === "code" ? (
        <MoveWorkspace
          creator={wallet ?? ""}
          onTarget={setTarget}
          onArtifacts={(a) => {
            setFromWorkspace(!!a);
            if (!a) {
              setMetadata("");
              setModules([]);
              return;
            }
            setMetadata(a.metadataHex);
            setModules(a.modules.map((m) => ({ ...m, size: m.hex.length / 2 })));
          }}
        />
      ) : (
        <>
          <ArtifactPicker
            t={t}
            accept=".bcs"
            multiple={false}
            label={t("fieldMetadata")}
            hint={t("fieldMetadataHint")}
            onPick={async (files) => {
              setMetadata(await readFileAsHex(files[0]));
              setFromWorkspace(false);
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
              setModules(
                await Promise.all(
                  picked.map(async (f) => ({ name: f.name, hex: await readFileAsHex(f), size: f.size }))
                )
              );
              setFromWorkspace(false);
            }}
          />
        </>
      )}
    </Form>
  );
}

/**
 * The two ways control can leave this account, as two cards rather than one card with a mode switch.
 *
 * They used to share a segmented switch ("Hand over" | "Renounce completely"), which read as two
 * settings of the same operation. They are not: transferring admin configures who governs next, and
 * renouncing destroys every signer and capability permanently, undoing any handover and surviving
 * every future version of the factory. As twins they sat at the same size and weight, one click apart,
 * which is the wrong amount of friction for a terminal action.
 *
 * So the handover is a plain card, and the renounce is its own card that stays collapsed until the
 * reader asks for it — making the irreversible path cost one deliberate extra step — and states the
 * consequence next to the button that performs it, where the eye already is, rather than in small grey
 * text at the top.
 *
 * The two confirmations are worded differently on purpose ("new owner" vs "this contract"): sharing
 * one phrase let the muscle memory of typing an address for one action carry straight into the other.
 */
export function GovernanceForm({
  t,
  pendingTransfer,
  pendingRenounce,
  run,
  contract,
  admin,
  wallet,
}: {
  t: any;
  /** Pending flags split per action so one card never shows the other's spinner. */
  pendingTransfer: boolean;
  pendingRenounce: boolean;
  run: (entry: any, args: any[], opts?: { successAddress?: string }) => Promise<string | null>;
  contract: string;
  /** The admin that governs this contract right now, shown before anything is changed. */
  admin?: string;
  wallet?: string;
}) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [typed, setTyped] = useState("");
  const [renounceOpen, setRenounceOpen] = useState(false);

  const addrOk = /^0x[0-9a-fA-F]{1,64}$/.test(next.trim()) && next.trim() !== "0x0";
  const transferReady = addrOk && sameAddress(confirm.trim(), next.trim());
  const renounceReady = typed.trim() !== "" && sameAddress(typed.trim(), contract);

  return (
    <div className="space-y-4">
      {/* Who governs it today. Above both cards, because both of them act on that fact. */}
      {admin && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {t("govCurrentAdmin")}
          </span>
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-cyan-200/90">{admin}</code>
          {wallet && sameAddress(admin, wallet) && (
            <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
              {t("you")}
            </span>
          )}
        </div>
      )}

      {/* Reversible: name the next owner. */}
      <Form
        title={t("govTransferTitle")}
        hint={t("transferFormHint")}
        ready={transferReady}
        pending={pendingTransfer}
        cta={t("transferFormCta")}
        tone="emerald"
        onSubmit={() => run("transfer_admin", [contract, next.trim()], { successAddress: contract })}
      >
        <Field label={t("fieldNewAdmin")} hint={t("fieldNewAdminHint")}>
          <input
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            className={inputCls}
          />
        </Field>
        <Field label={t("transferFormConfirmLabel", { address: next || "0x…" })}>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={next || "0x…"}
            spellCheck={false}
            className={inputCls}
          />
        </Field>
        <Warning>{t("transferFormWarning")}</Warning>
      </Form>

      {/* Terminal: collapsed until deliberately revealed. */}
      <Form
        title={t("govRenounceTitle")}
        hint={t("renounceFormHint", { address: contract })}
        ready={renounceReady}
        pending={pendingRenounce}
        cta={t("renounceFormCta")}
        tone="rose"
        hideCta={!renounceOpen}
        onSubmit={() => run("renounce_contract", [contract], { successAddress: contract })}
      >
        {!renounceOpen ? (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-[11px] leading-relaxed text-rose-100/80">
              {t("renounceFormWarning")}
            </p>
            <button
              type="button"
              onClick={() => setRenounceOpen(true)}
              className="shrink-0 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3.5 py-2 text-[11px] font-bold text-rose-200 transition-colors hover:bg-rose-500/20 focus-visible:ring-2 focus-visible:ring-rose-300/50"
            >
              {t("govRenounceReveal")}
            </button>
          </div>
        ) : (
          <>
            {/*
              The subject, restated here on purpose. Splitting this card removed the shared chip, and
              with the upgrade card hidden on the picker surface there was nothing left naming the
              address — so the most irreversible action in the app had no visible target. An action
              that destroys everything must say what it is destroying, next to the button.
            */}
            <ContractChip t={t} address={contract} />
            {/* The consequence, at the point of decision rather than in the grey hint above. */}
            <div className="rounded-lg border border-rose-400/35 bg-rose-500/10 px-3.5 py-3">
              <p className="text-[11px] font-bold leading-relaxed text-rose-100">
                {t("renounceFormWarning")}
              </p>
            </div>
            <Field label={t("renounceFormConfirmLabel", { address: contract })}>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={contract}
                spellCheck={false}
                className={inputCls}
              />
            </Field>
            <button
              type="button"
              onClick={() => setRenounceOpen(false)}
              className="self-start text-[11px] font-bold text-gray-500 transition-colors hover:text-gray-300 focus-visible:outline-none focus-visible:underline"
            >
              {t("govRenounceHide")}
            </button>
          </>
        )}
      </Form>
    </div>
  );
}
