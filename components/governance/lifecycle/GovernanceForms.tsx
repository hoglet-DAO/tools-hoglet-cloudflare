"use client";

import { useState } from "react";
import { MoveWorkspace } from "@/components/governance/MoveWorkspace";
import { sameAddress } from "@/lib/governance/offerChallenge";
import { readFileAsHex, isUsableHex, filterBuildFiles } from "@/lib/governance/buildArtifacts";
import { Form, SourceTabs, ArtifactPicker, Field, Warning, inputCls } from "./LifecycleShared";

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

export function TransferAdminForm({
  t,
  isPending,
  run,
  contract,
}: {
  t: any;
  isPending: boolean;
  run: (entry: any, args: any[]) => Promise<string | null>;
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
  );
}

export function RenounceForm({
  t,
  isPending,
  run,
  contract,
}: {
  t: any;
  isPending: boolean;
  run: (entry: any, args: any[]) => Promise<string | null>;
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
      onSubmit={() => run("renounce_contract", [contract])}
    >
      <Warning>{t("renounceFormWarning")}</Warning>
      <Field label={t("renounceFormConfirmLabel", { address: contract })}>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={contract}
          spellCheck={false}
          className={inputCls}
        />
      </Field>
    </Form>
  );
}
