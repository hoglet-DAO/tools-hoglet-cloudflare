"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSupraWallet } from "@/context/SupraWalletContext";
import {
  useGovernanceAudit,
  type GovernanceVerdict,
} from "@/hooks/features/governance/useGovernanceAudit";
import { normalizeAddressHex, sameAddress } from "@/lib/governance/offerChallenge";

/**
 * The read side of the governance surface, with no actions attached.
 *
 * Everything that *reads* an address — the command bar, the verdict, the deterministic predictions —
 * lives here, and everything that *writes* lives in the runners. That split is what lets the auditor
 * be mounted on its own, or next to any set of actions, instead of each section carrying its own copy
 * of the same eleven-view read.
 *
 * Kept as a provider rather than as more props because the panel and the runner both need the verdict
 * and both need to trigger the same re-read. Threading that through props meant either drilling or
 * duplicating the hook, and duplicating the hook meant two independent verdicts that could disagree.
 */
interface AuditContextValue {
  verdict: GovernanceVerdict | null;
  isAuditing: boolean;
  error: string | null;
  /** Re-reads the chain for `subject`. Safe to call after any transaction that changed it. */
  audit: () => void;
  /** The address currently under audit. */
  subject: string;
  /** Raw text in the command bar; `subject` is the normalized fallback to the wallet. */
  target: string;
  setTarget: (value: string) => void;
  wallet: string;
  rpcUrl: string;
  /** Wallet connect, exposed so the panel can offer the connection without owning the wallet hook. */
  connect: (provider: "starkey") => void;
  /** Deterministic addresses the current subject would get. Filled in by the panel's predict button. */
  /** Pure views, exposed so a form can resolve its own target address without opening the predictor. */
  predictResourceAccount: (rpcUrl: string, creator: string, label: string) => Promise<string | undefined>;
  predictEoaProxy: (rpcUrl: string, eoa: string) => Promise<string | undefined>;
  /** Whether the factory already holds a record for an address. */
  isFactoryManaged: (rpcUrl: string, addr: string) => Promise<boolean>;
  copied: string | null;
  handleCopy: (value: string) => void;
}

const AuditContext = createContext<AuditContextValue | null>(null);

export function GovernanceAuditProvider({ children }: { children: React.ReactNode }) {
  const { rpcUrl, accounts, connect } = useSupraWallet();
  const { verdict, isAuditing, error, audit, predictResourceAccount, predictEoaProxy, isFactoryManaged } =
    useGovernanceAudit();

  const [target, setTarget] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const wallet = accounts[0] || "";
  const subject = target.trim() || wallet;

  const auditSubject = useCallback(
    (address: string) => {
      if (!rpcUrl || !address) return;
      // Normalize to a full 32-byte address so a short-hand input (`0xa`) audits, displays and
      // compares as the account it means.
      audit(rpcUrl, normalizeAddressHex(address) ?? address);
    },
    [rpcUrl, audit]
  );

  const handleAudit = useCallback(() => auditSubject(subject), [auditSubject, subject]);

  const handleCopy = useCallback((value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1600);
  }, []);

  /**
   * Rebuilds the panel from the chain when a subject becomes auditable (mount, wallet connect,
   * network change), so a refresh no longer lands the visitor on an empty page to re-scan by hand.
   *
   * The guard is what keeps it from looping: `subject` derives from the connected account, which
   * itself changes on connect. All eleven views are read-only, so running this unattended is safe.
   */
  useEffect(() => {
    if (!rpcUrl || !subject) return;
    if (verdict?.subject && sameAddress(verdict.subject, subject)) return;
    auditSubject(subject);
  }, [rpcUrl, subject, verdict?.subject, auditSubject]);

  const value = useMemo<AuditContextValue>(
    () => ({
      verdict,
      isAuditing,
      error,
      audit: handleAudit,
      subject,
      target,
      setTarget,
      wallet,
      rpcUrl,
      connect,
      predictResourceAccount,
      predictEoaProxy,
      isFactoryManaged,
      copied,
      handleCopy,
    }),
    [
      verdict,
      isAuditing,
      error,
      handleAudit,
      subject,
      target,
      wallet,
      rpcUrl,
      connect,
      predictResourceAccount,
      predictEoaProxy,
      isFactoryManaged,
      copied,
      handleCopy,
    ]
  );

  return <AuditContext.Provider value={value}>{children}</AuditContext.Provider>;
}

/** Throws rather than returning undefined so a missing provider fails loudly, not silently. */
export function useGovernanceAuditContext(): AuditContextValue {
  const ctx = useContext(AuditContext);
  if (!ctx) {
    throw new Error("useGovernanceAuditContext must be used inside <GovernanceAuditProvider>");
  }
  return ctx;
}