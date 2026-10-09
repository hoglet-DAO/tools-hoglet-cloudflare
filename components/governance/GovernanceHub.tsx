"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { MeshBackground } from "@/components/wizard/MeshBackground";
import {
  GovernanceAuditProvider,
  useGovernanceAuditContext,
} from "@/components/governance/GovernanceAuditContext";
import { GovernanceAuditPanel } from "@/components/governance/GovernanceAuditPanel";
import { LifecycleRunner, type GovernanceMode } from "@/components/governance/LifecycleRunner";
import { DAO_CONTRACTS_VAULT } from "@/config/contracts";

const VAULT_NOT_PUBLISHED = DAO_CONTRACTS_VAULT === "0x1";

/**
 * Composes the read half and the write half of the governance surface.
 *
 * The audit state lives in `GovernanceAuditProvider` rather than here, so `GovernanceAuditPanel` and
 * `LifecycleRunner` read the same verdict instead of each holding its own. Two independent audits
 * could disagree after a transaction landed, and the disagreement would look like a bug in the verdict
 * rather than in the wiring.
 *
 * The only thing `mode` changes is which actions the runner offers. The read is identical on both
 * routes, because "who controls this" does not depend on which actions the visitor came for.
 */
export function GovernanceHub({ mode = "contracts" }: { mode?: GovernanceMode }) {
  return (
    <GovernanceAuditProvider>
      <GovernanceShell mode={mode} />
    </GovernanceAuditProvider>
  );
}

function GovernanceShell({ mode }: { mode: GovernanceMode }) {
  const t = useTranslations("Governance");
  const { verdict, audit, wallet, rpcUrl } = useGovernanceAuditContext();

  return (
    <section className="relative px-4 py-8 sm:px-6 sm:py-10 max-w-6xl mx-auto w-full">
      <MeshBackground />

      {/* Masthead. The two modes are separate surfaces on purpose: a module the factory owns and an
          account the visitor owns are different risk models, and one page listing both taught people
          to expect the same guarantees from either. */}
      <header className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          {mode === "contracts" ? t("hubContractsTitle") : t("hubAccountsTitle")}
        </h1>
        <p className="mt-1.5 text-sm text-gray-400 max-w-2xl">
          {mode === "contracts" ? t("hubContractsSubtitle") : t("hubAccountsSubtitle")}
        </p>
      </header>

      {VAULT_NOT_PUBLISHED && (
        <div className="mb-6 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200">{t("factoryNotPublished")}</p>
        </div>
      )}

      <GovernanceAuditPanel mode={mode} />

      {/* The write half */}
      <LifecycleRunner mode={mode} verdict={verdict} wallet={wallet} rpcUrl={rpcUrl} onAudit={audit} />

      {/*
        The lifecycle entries reference and the glossary are intentionally not rendered here.

        The entries list duplicated the Interactor: every row was a `::`-joined signature that only
        opened the Interactor with the same module already loaded, so it offered a shortcut to a
        screen that already does it — while on this page it read as a second, competing interface.
        It was removed rather than hidden. `GovernanceGlossary` survives in the codebase, unmounted,
        for a home that is actually about protocol vocabulary instead of competing with the audit.
      */}
    </section>
  );
}

export default GovernanceHub;