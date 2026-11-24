"use client";

import { useCallback, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { DAO_CONTRACTS_VAULT } from "@/config/contracts";
import { buildVaultContextPack } from "@/lib/vault/context";

/**
 * Copies the vault's full context pack (schema `hoglet.vault-context.v1`) for an AI agent: lifecycle,
 * risk-tagged entries, views, status codes, error codes, invariants, fee bounds and a ready operator
 * prompt. Same idea as the workspace's "Copy AI prompt", one level up: that button teaches a model how to
 * compile a package for a given address; this one teaches it how to govern what the factory owns.
 *
 * The pack is built from `config/vault.ts` (pinned to the Move sources by `npm run check:vault`), so
 * what lands on the clipboard cannot drift from what is deployed.
 */
export function VaultPackButton({ className = "" }: { className?: string }) {
  const t = useTranslations("Governance");
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const pack = buildVaultContextPack(DAO_CONTRACTS_VAULT);
    const json = JSON.stringify(pack, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context). Silently ignore rather than
      // throwing inside an onClick: the button simply does not flip to "copied".
    }
  }, []);

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={t("aiPackHint")}
      aria-label={t("aiPackHint")}
      className={`inline-flex shrink-0 items-center gap-2 rounded-lg border border-indigo-400/25 bg-indigo-500/10 px-3 py-1.5 text-xs font-bold text-indigo-300 transition-colors hover:bg-indigo-500/20 focus-visible:ring-2 focus-visible:ring-indigo-300/50 ${className}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
      {copied ? t("aiPackCopied") : t("aiPackCta")}
    </button>
  );
}

export default VaultPackButton;
