import { useCallback, useState } from "react";
import { callViewRaw, addressHostsModules, firstViewResult } from "@/hooks/features/view/useView";
import { normalizeAddressHex } from "@/lib/governance/offerChallenge";
import { GOVERNANCE_FACTORY } from "@/config/contracts";
import { trace, traceWarn } from "@/lib/debug";

export const EOA_SECURITY_STATUS = {
  UNMANAGED: 0,
  PERMANENTLY_RENOUNCED: 1,
  VERIFIED_DAO_GOVERNED: 2,
  HAZARD_KEY_STILL_ACTIVE: 3,
} as const;

/**
 * Where a subject sits in the governance lifecycle. Derived from on-chain facts only, so the UI can
 * gate entries instead of trusting the user's intent.
 *
 * - `unmanaged`   no factory record; deploy or donate are the only meaningful steps
 * - `dual_master` donated, key still alive -> the creator can bypass the DAO (status 3)
 * - `governed`    key annihilated + capability delegated -> upgrades flow through the admin
 * - `frozen`      renounced; nothing can ever change again
 */
export type LifecycleStage = "unmanaged" | "dual_master" | "governed" | "frozen";

export interface GovernanceVerdict {
  /** The address this verdict describes. */
  subject: string;
  stage: LifecycleStage;
  status: number;
  keyAnnihilated: boolean;
  permanentlyImmutable: boolean;
  donationComplete: boolean;
  contractRenounced: boolean;
  cryptographicallyFrozen: boolean;
  /** Resolved off-chain: does the admin address host at least one published module? */
  adminIsContract: boolean;
  /** True when the factory holds a ManagedContract for this subject. */
  factoryManaged: boolean;
  /** True when the subject is a donated legacy EOA (vs an Autonomous Resource Account). */
  isEoa: boolean;
  admin: string;
  proxy: string;
}

/** Every view the audit reads, in one place. */
const VIEWS = {
  get_eoa_security_status: true,
  is_eoa_key_annihilated: true,
  is_eoa_permanently_immutable: true,
  is_eoa_donation_complete: true,
  is_contract_renounced: true,
  is_cryptographically_frozen: true,
  get_contract_admin: true,
  get_eoa_proxy: true,
  is_eoa_contract: true,
} as const;

type ViewName = keyof typeof VIEWS;

export function useGovernanceAudit() {
  const [verdict, setVerdict] = useState<GovernanceVerdict | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Reads every governance view concurrently. A view that aborts (an unmanaged address makes several
   * of them assert) resolves to `undefined` instead of failing the whole audit.
   */
  const audit = useCallback(async (rpcUrl: string, targetAddress: string): Promise<void> => {
    if (!rpcUrl || !targetAddress) return;
    setIsAuditing(true);
    setError(null);

    const safe = async (fn: ViewName): Promise<any> => {
      try {
        const res = await callViewRaw(rpcUrl, GOVERNANCE_FACTORY, "governance", fn, [], [targetAddress]);
        const value = firstViewResult(res);
        trace(`[governance:audit] ${fn}(${targetAddress}) ->`, { raw: res, value });
        return value;
      } catch (e: any) {
        // A view that aborts is normal for an unmanaged address, but if ALL of them fail the module
        // is almost certainly not deployed at GOVERNANCE_FACTORY.
        traceWarn(`[governance:audit] ${fn} FAILED ->`, e?.message || e);
        return undefined;
      }
    };

    try {
      const names = Object.keys(VIEWS) as ViewName[];
      trace(`[governance:audit] start`, {
        factory: GOVERNANCE_FACTORY,
        network: rpcUrl?.includes("mainnet") ? "mainnet" : "testnet",
        subject: targetAddress,
      });
      const results = await Promise.all(names.map((fn) => safe(fn)));
      const byName = Object.fromEntries(names.map((n, i) => [n, results[i]])) as Record<ViewName, any>;

      // Views returning `address` come back trimmed of leading zeros; pad them for stable display.
      const adminAddr = normalizeAddressHex(firstViewResult(byName.get_contract_admin)) ?? "";
      const adminIsContract = adminAddr && !/^0x0+$/.test(adminAddr)
        ? await addressHostsModules(rpcUrl, adminAddr).catch(() => false)
        : false;

      const renounced = byName.is_contract_renounced === true;
      const frozen = byName.is_cryptographically_frozen === true || renounced;
      const keyDead = byName.is_eoa_key_annihilated === true;
      const managed = byName.is_eoa_contract === true;
      const proxy = normalizeAddressHex(firstViewResult(byName.get_eoa_proxy)) ?? "";

      // A factory-managed record is what distinguishes "our DAO" from any Resource Account, which
      // would otherwise also satisfy key-dead + offer and look DAO-governed.
      const factoryManaged = managed || renounced || !/^0x0+$/.test(adminAddr || "0x0");

      const status = typeof byName.get_eoa_security_status === "number"
        ? byName.get_eoa_security_status
        : EOA_SECURITY_STATUS.UNMANAGED;

      let stage: LifecycleStage;
      if (renounced || byName.is_eoa_permanently_immutable === true) stage = "frozen";
      else if (status === EOA_SECURITY_STATUS.HAZARD_KEY_STILL_ACTIVE) stage = "dual_master";
      else if (keyDead && byName.is_eoa_donation_complete === true) stage = "governed";
      else stage = "unmanaged";

      trace(`[governance:audit] verdict`, {
        stage,
        status,
        keyDead,
        managed,
        renounced,
        factoryManaged,
        adminIsContract,
        admin: adminAddr,
        proxy,
      });

      setVerdict({
        subject: targetAddress,
        stage,
        status,
        keyAnnihilated: keyDead,
        permanentlyImmutable: byName.is_eoa_permanently_immutable === true,
        donationComplete: byName.is_eoa_donation_complete === true,
        contractRenounced: renounced,
        cryptographicallyFrozen: frozen,
        adminIsContract,
        factoryManaged,
        isEoa: byName.is_eoa_contract === true,
        admin: adminAddr,
        proxy,
      });
    } catch (e: any) {
      setError(e?.message || "Audit failed");
    } finally {
      setIsAuditing(false);
    }
  }, []);

  /** Pure view: the Resource Account a creator would deploy to. */
  const predictResourceAccount = useCallback(async (rpcUrl: string, creator: string) => {
    const res = await callViewRaw(rpcUrl, GOVERNANCE_FACTORY, "governance", "predict_next_contract_address", [], [creator]);
    return normalizeAddressHex(firstViewResult(res));
  }, []);

  /** Pure view: the proxy that would govern a donated EOA. */
  const predictEoaProxy = useCallback(async (rpcUrl: string, eoa: string) => {
    const res = await callViewRaw(rpcUrl, GOVERNANCE_FACTORY, "governance", "predict_eoa_proxy_address", [], [eoa]);
    return normalizeAddressHex(firstViewResult(res));
  }, []);

  const reset = useCallback(() => {
    setVerdict(null);
    setError(null);
  }, []);

  return { verdict, isAuditing, error, audit, predictResourceAccount, predictEoaProxy, reset };
}