"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useGovernanceAuditContext } from "@/components/governance/GovernanceAuditContext";
import { MoveWorkspace } from "@/components/governance/MoveWorkspace";
import { labelToHex } from "@/utils/hex";
import { readFileAsHex, isUsableHex, filterBuildFiles } from "@/lib/governance/buildArtifacts";
import { Form, Field, SourceTabs, ArtifactPicker, inputCls } from "./LifecycleShared";

export function DeployForm({
  t,
  isPending,
  run,
}: {
  t: any;
  isPending: boolean;
  run: (entry: any, args: any[], opts?: { successAddress?: string }) => Promise<string | null>;
}) {
  const { wallet, rpcUrl, isFactoryManaged } = useGovernanceAuditContext();
  const [admin, setAdmin] = useState("");
  const [metadata, setMetadata] = useState("");
  const [modules, setModules] = useState<{ name: string; hex: string; size: number }[]>([]);
  const [source, setSource] = useState<"code" | "upload">("code");
  const [immutable, setImmutable] = useState(false);
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const [targetTaken, setTargetTaken] = useState(false);
  const [deployedTarget, setDeployedTarget] = useState<string | null>(null);

  /**
   * The connected wallet is the natural default owner, so the field starts filled with it. A manual edit
   * takes over — after that the field is the user's, and a later wallet change no longer overwrites it.
   */
  const adminTouched = useRef(false);
  useEffect(() => {
    if (!adminTouched.current) setAdmin(wallet);
  }, [wallet]);

  useEffect(() => {
    if (isPending) return;
    if (!rpcUrl || !target) {
      setTargetTaken(false);
      return;
    }
    let live = true;
    isFactoryManaged(rpcUrl, target)
      .then((taken) => {
        if (live) setTargetTaken(taken || target === deployedTarget);
      })
      .catch(() => {
        if (live) setTargetTaken(target === deployedTarget);
      });
    return () => {
      live = false;
    };
  }, [rpcUrl, target, isFactoryManaged, isPending, deployedTarget]);

  const adminOk = /^0x[0-9a-fA-F]{1,64}$/.test(admin.trim()) && admin.trim() !== "0x0";
  const ready = isUsableHex(metadata) && modules.length > 0 && (targetTaken || immutable || adminOk);

  const notReadyReason =
    !targetTaken && !immutable && !adminOk
      ? t("deployNeedAdmin")
      : !isUsableHex(metadata)
        ? t("deployNeedMetadata")
        : modules.length === 0
          ? t("deployNeedBytecode")
          : undefined;

  return (
    <Form
      title={t("deployFormTitle")}
      hint={t("deployFormHint")}
      ready={ready}
      pending={isPending}
      cta={targetTaken ? t("upgradeFormCta") : t("deployFormCta")}
      reason={notReadyReason}
      onSubmit={async () => {
        if (targetTaken) {
          await run("upgrade_contract", [target, metadata, modules.map((m) => m.hex)], {
            successAddress: target,
          });
          return;
        }
        const txHash = await run(
          "deploy_autonomous_contract",
          [
            labelToHex(label),
            metadata,
            modules.map((m) => m.hex),
            immutable ? "0x0" : admin.trim(),
          ],
          { successAddress: target }
        );
        if (txHash) setDeployedTarget(target);
      }}
    >
      {targetTaken && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("deployTargetTaken", { address: target })}
        </p>
      )}

      <SourceTabs
        source={source}
        onChange={(next) => {
          setSource(next);
          setMetadata("");
          setModules([]);
        }}
        t={t}
      />

      {source === "code" ? (
        <MoveWorkspace
          creator={wallet}
          onTarget={setTarget}
          onLabel={setLabel}
          onArtifacts={(a) => {
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
        <div className="space-y-3">
          <p className="text-[10px] leading-relaxed text-gray-500">{t("deployManualFiles")}</p>

          <ArtifactPicker
            t={t}
            accept=".bcs"
            multiple={false}
            label={t("fieldMetadata")}
            hint={t("fieldMetadataHint")}
            onPick={async (files) => {
              setMetadata(await readFileAsHex(files[0]));
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
        </div>
      )}

      {!targetTaken && (
        <>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 select-none">
            <input
              type="checkbox"
              checked={immutable}
              onChange={(e) => setImmutable(e.target.checked)}
              className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-rose-500"
            />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-gray-200">{t("deployImmutableToggle")}</span>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-gray-500">
                {t("deployImmutableHint")}
              </span>
            </span>
          </label>

          {immutable ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("deployImmutableWarning")}
            </p>
          ) : (
            <Field label={t("fieldDaoAdmin")} hint={t("fieldDaoAdminHint")}>
              <input
                value={admin}
                onChange={(e) => {
                  adminTouched.current = true;
                  setAdmin(e.target.value);
                }}
                placeholder="0x…"
                spellCheck={false}
                className={inputCls}
              />
            </Field>
          )}
        </>
      )}
    </Form>
  );
}
