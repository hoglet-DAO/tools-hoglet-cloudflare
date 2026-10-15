"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Boxes, Check, Copy, ExternalLink, Loader2, Package, UserRound, Wallet } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  GovernanceAuditProvider,
  useGovernanceAuditContext,
} from "@/components/governance/GovernanceAuditContext";
import { LifecycleRunner } from "@/components/governance/LifecycleRunner";
import { sameAddress } from "@/lib/governance/offerChallenge";
import { getExplorerUrl } from "@/utils/supra/explorerUtils";
import { useNetwork } from "@/context/NetworkContext";
import { STATUS_META } from "./statusMeta";

/**
 * "My contracts": the contracts *this* wallet deployed through the factory, in one place, so the
 * irreversible ones (renounce) and the reversible ones (upgrade, transfer) are a deliberate
 * destination rather than something buried behind a paste in the general audit screen.
 *
 * It reads the same verdict and reuses the same `LifecycleRunner` — only the *entry* differs: the
 * subject is picked from the creator's own catalog instead of typed. The type is inferred from
 * `listCreatorContracts` so this surface does not depend on the exact shape name.
 */
type CreatorContract = Awaited<
  ReturnType<ReturnType<typeof useGovernanceAuditContext>["listCreatorContracts"]>
>[number];

/** `0x1234…abcd`, trimmed for a list row. */
function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 10)}…${address.slice(-6)}` : address;
}

export function MyContractsHub() {
  return (
    <GovernanceAuditProvider>
      <MyContractsShell />
    </GovernanceAuditProvider>
  );
}

function MyContractsShell() {
  const t = useTranslations("Governance");
  const {
    verdict,
    isAuditing,
    error,
    wallet,
    rpcUrl,
    audit,
    auditAddress,
    setTarget,
    connect,
    copied,
    handleCopy,
    listCreatorContracts,
  } = useGovernanceAuditContext();
  const { network } = useNetwork();

  const [contracts, setContracts] = useState<CreatorContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");

  /**
   * The catalog read, kept as a callback so it can be repeated after a write.
   *
   * The list is a snapshot: `is_renounced` and `admin` are baked into each row at fetch time. Renouncing
   * a contract did not refresh it, so the row kept saying "Active" and "you" for a contract that was
   * already frozen — the page contradicting itself immediately after the irreversible action.
   */
  const loadContracts = useCallback(async () => {
    if (!rpcUrl || !wallet) {
      setContracts([]);
      return;
    }
    setLoading(true);
    setListError(null);
    try {
      setContracts(await listCreatorContracts(rpcUrl, wallet));
    } catch (e: any) {
      setContracts([]);
      setListError(e?.message || "failed");
    } finally {
      setLoading(false);
    }
  }, [rpcUrl, wallet, listCreatorContracts]);

  useEffect(() => {
    let live = true;
    if (live) void loadContracts();
    return () => {
      live = false;
    };
  }, [loadContracts]);

  const select = useCallback(
    (address: string) => {
      setSelected(address);
      setTarget(address);
      auditAddress(address);
    },
    [setTarget, auditAddress]
  );

  // Land on something useful: the first still-governable contract, so the detail pane is never an
  // empty box the moment the list loads.
  useEffect(() => {
    if (selected || contracts.length === 0) return;
    select(contracts.find((c) => !c.isRenounced)?.address ?? contracts[0].address);
  }, [contracts, selected, select]);

  /**
   * Re-reads both halves after a write: the verdict the action changed, and the catalog row it changed.
   */
  const handleAudit = useCallback(() => {
    void loadContracts();
    audit();
  }, [loadContracts, audit]);

  const selectedContract = contracts.find((c) => sameAddress(c.address, selected)) ?? null;
  const meta = verdict ? STATUS_META[verdict.status as keyof typeof STATUS_META] ?? STATUS_META[0] : null;
  const StatusIcon = meta?.icon;

  /**
   * Whether the verdict on screen belongs to the contract the visitor picked.
   *
   * `auditAddress` resolves eleven views, so for a moment after a click the verdict still describes the
   * previously selected contract. Rendering the runner during that window offered its actions — renounce
   * included — for a contract other than the highlighted one, and the transfer/renounce arguments come
   * from `verdict.subject`. Gating on the match is what keeps the buttons pointed at what is highlighted.
   */
  const verdictMatchesSelection = !!verdict && !!selected && sameAddress(verdict.subject, selected);
  const detailLoading = isAuditing || !verdictMatchesSelection;

  return (
    <section className="relative px-4 py-8 sm:px-6 sm:py-10 max-w-6xl mx-auto w-full">
      <header className="mb-5">
        <h1 className="flex items-center gap-2.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          <Boxes className="w-6 h-6 text-cyan-300" />
          {t("myContractsTitle")}
        </h1>
        <p className="mt-1.5 text-sm text-gray-400 max-w-2xl">{t("myContractsSubtitle")}</p>
      </header>

      {!wallet ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5">
          <button
            type="button"
            onClick={() => connect("starkey")}
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-cyan-300 focus-visible:outline-none focus-visible:underline"
          >
            <Wallet className="w-3.5 h-3.5" />
            {t("connectWallet")}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          {/* The picker: this wallet's deployments */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2 px-1 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                {t("myContractsListHeading")}
              </span>
              <span className="ml-auto text-[10px] font-bold text-gray-500">{contracts.length}</span>
            </div>

            {loading && contracts.length === 0 && (
              <p className="flex items-center gap-2 px-1 py-3 text-[11px] text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t("myContractsLoading")}
              </p>
            )}

            {!loading && contracts.length === 0 && (
              <div className="px-1 py-3">
                <p className="text-[11px] leading-relaxed text-gray-500">{t("myContractsEmpty")}</p>
                <Link
                  href="/governance"
                  className="mt-2 inline-block text-[11px] font-bold text-cyan-300 hover:underline"
                >
                  {t("myContractsGoDeploy")}
                </Link>
              </div>
            )}

            <ul className="space-y-1.5">
              {contracts.map((c, i) => {
                const isActive = sameAddress(c.address, selected);
                const adminIsYou = sameAddress(c.admin, wallet);
                const explorer = getExplorerUrl(network, "address", c.address);
                return (
                  <li key={c.address}>
                    <button
                      type="button"
                      onClick={() => select(c.address)}
                      /*
                        The accessible name has to carry the address. These rows are visually identical
                        — `0x3ec6…98cc9f` — so a label of "Manage this contract" ten times over gave a
                        screen-reader user no way to tell them apart, and overrode the address that was
                        right there as the visible text.
                      */
                      aria-label={`${t("myContractsSelect")} ${c.address}`}
                      className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300/40 ${
                        isActive
                          ? "border-cyan-300/40 bg-cyan-400/10"
                          : "border-white/10 bg-black/30 hover:bg-white/5"
                      }`}
                    >
                      {c.isResourceAccount ? (
                        <Package className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                      ) : (
                        <UserRound className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[11px] text-cyan-200/90">
                          {shortAddress(c.address)}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[9px] text-gray-500">
                          {c.isResourceAccount ? t("myContractsResourceAccount") : t("myContractsEoa")}
                          {adminIsYou && !c.isRenounced && (
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-1.5 text-emerald-300">
                              {t("you")}
                            </span>
                          )}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          c.isRenounced
                            ? "border-white/10 bg-white/5 text-gray-500"
                            : "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                        }`}
                      >
                        {c.isRenounced ? t("myContractsFrozen") : t("myContractsActive")}
                      </span>
                      {/*
                        The catalog carries no name for a deployment, so a row is nothing but an
                        address and nothing on-chain tells you which module it holds. The explorer link
                        is what makes a row identifiable — without it a list of ten is unnavigable.
                      */}
                      {explorer && (
                        <span
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(explorer, "_blank", "noopener,noreferrer");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              window.open(explorer, "_blank", "noopener,noreferrer");
                            }
                          }}
                          aria-label={`${t("myContractsExplorer")} ${c.address}`}
                          title={t("myContractsExplorer")}
                          className="shrink-0 rounded p-1 text-gray-600 transition-colors hover:bg-white/5 hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-cyan-300/50"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* The detail: who controls it, then the lifecycle actions */}
          <div className="min-w-0">
            {!selected && (
              <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-6 text-center text-[12px] text-gray-500">
                {t("myContractsPick")}
              </div>
            )}

            {selected && (
              <>
                {/*
                  Status card. While the verdict belongs to the previous selection — or the audit
                  failed outright — this must not show a verdict, because the actions below it are
                  built from `verdict.subject`.
                */}
                {detailLoading ? (
                  <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3 text-[11px] text-gray-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {error || t("analyzing")}
                  </div>
                ) : (
                  <div
                    className={`mb-4 flex items-center gap-3 rounded-2xl border p-3.5 ${
                      meta ? `${meta.edge} ${meta.wash}` : "border-white/10 bg-white/5"
                    }`}
                  >
                    {StatusIcon && <StatusIcon className={`w-5 h-5 shrink-0 ${meta?.accent}`} />}
                    <div className="min-w-0 flex-1">
                      {meta ? (
                        <p className={`text-sm font-bold ${meta.accent}`}>{t(meta.key)}</p>
                      ) : (
                        <p className="text-sm font-bold text-gray-400">{t("analyzing")}</p>
                      )}
                    </div>
                    {selectedContract && (
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedContract.address)}
                        aria-label={t("copyAddress")}
                        className="shrink-0 rounded p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200 focus-visible:ring-2 focus-visible:ring-cyan-300/50"
                      >
                        {copied === selectedContract.address ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                )}

                {error && !detailLoading && (
                  <p className="mb-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3.5 py-2.5 text-[11px] leading-relaxed text-rose-200">
                    {error}
                  </p>
                )}

                {/*
                  No admin row and no stage pill here: `LifecycleRunner` announces the stage with a
                  full header and explanation, and the governance form states who governs it right
                  above the actions that change it. Repeating either one here was pure repetition —
                  three copies of the same fact on a single screen.
                */}
                {!detailLoading && (
                  <LifecycleRunner
                    mode="contracts"
                    verdict={verdict}
                    wallet={wallet}
                    rpcUrl={rpcUrl}
                    onAudit={handleAudit}
                    collapseUpgrade
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default MyContractsHub;
