import { useCallback, useState } from "react";
import { callViewRaw, addressHostsModules, firstViewResult } from "@/hooks/features/view/useView";
import { normalizeAddressHex, sameAddress } from "@/lib/governance/offerChallenge";
import { labelToHex } from "@/utils/hex";
import { DAO_CONTRACTS_VAULT, VAULT_MODULE } from "@/config/contracts";
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
 * - `governed`    factory-managed and usable — a donated EOA with a dead key, or an autonomous Resource
 *                 Account — so upgrades, transfers and renounce flow through the admin (status 2)
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
  /**
   * Where the subject's signer capability is currently offered. @0x0 when no offer exists.
   * Compare against `proxy`: a mismatch means the delegation was redirected somewhere the factory
   * cannot see, which no factory entry point can cause.
   */
  offerTarget: string;
  /**
   * True when a factory record exists, an offer is present, and it does NOT point at our proxy.
   *
   * The dangerous state, and it needs its own flag because every other view collapses it into the
   * same `false` as "never donated". The owner must be told before destroying their key: cancelling a
   * delegation requires that key, so burning it here makes the loss permanent.
   */
  offerRedirected: boolean;
  /**
   * False when the deployed factory predates `get_offer_target` and the recipient could not be read.
   * Distinct from `offerRedirected: false` — one means "intact", the other means "unknown".
   */
  offerTargetKnown: boolean;
}

/** Every view the audit reads, in one place. */
const VIEWS = {
  get_eoa_security_status: true,
  is_eoa_key_annihilated: true,
  is_eoa_permanently_immutable: true,
  is_eoa_donation_complete: true,
  is_contract_renounced: true,
  is_cryptographically_frozen: true,
  get_offer_target: true,
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
        const res = await callViewRaw(rpcUrl, DAO_CONTRACTS_VAULT, VAULT_MODULE, fn, [], [targetAddress]);
        const value = firstViewResult(res);
        trace(`[governance:audit] ${fn}(${targetAddress}) ->`, { raw: res, value });
        return value;
      } catch (e: any) {
        // A view that aborts is normal for an unmanaged address, but if ALL of them fail the module
        // is almost certainly not deployed at DAO_CONTRACTS_VAULT.
        traceWarn(`[governance:audit] ${fn} FAILED ->`, e?.message || e);
        return undefined;
      }
    };

    try {
      const names = Object.keys(VIEWS) as ViewName[];
      trace(`[governance:audit] start`, {
        vault: DAO_CONTRACTS_VAULT,
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

      // The pair that reveals a stripped delegation: the proxy this factory expects versus the one the
      // framework actually holds. `offerRedirected` is derived here rather than read from a boolean
      // view on purpose — one source of truth, and the recipient address stays available to the UI,
      // which is the actionable half of this finding.
      const offerTarget = normalizeAddressHex(firstViewResult(byName.get_offer_target)) ?? "";
      const noOffer = /^0x0*$/.test(offerTarget);
      const offerRedirected = !!proxy && !noOffer && !sameAddress(offerTarget, proxy);

      // An older factory predates `get_offer_target`, so a read failure yields no recipient and
      // `offerRedirected` stays false. Recorded explicitly rather than left implicit, because
      // "not redirected" and "cannot tell yet" are different claims to make to someone about to
      // destroy their key.
      const offerTargetKnown = byName.get_offer_target !== undefined;

      const status = typeof byName.get_eoa_security_status === "number"
        ? byName.get_eoa_security_status
        : EOA_SECURITY_STATUS.UNMANAGED;

      let stage: LifecycleStage;
      if (renounced || byName.is_eoa_permanently_immutable === true) stage = "frozen";
      else if (status === EOA_SECURITY_STATUS.HAZARD_KEY_STILL_ACTIVE) stage = "dual_master";
      // Status 2 is the factory's own "managed and usable" verdict, and it covers both a donated EOA whose
      // key is dead and an autonomous Resource Account. Gating this on `is_eoa_donation_complete` instead
      // left every autonomous deployment stuck at `unmanaged`, so its upgrade / transfer / renounce forms
      // never appeared even though the factory does govern it.
      else if (status === EOA_SECURITY_STATUS.VERIFIED_DAO_GOVERNED) stage = "governed";
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
        offerTarget,
        offerRedirected,
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
        offerTarget,
        offerRedirected,
        offerTargetKnown,
      });
    } catch (e: any) {
      setError(e?.message || "Audit failed");
    } finally {
      setIsAuditing(false);
    }
  }, []);

  /** Pure view: the Resource Account a creator would deploy to under a given label. */
  const predictResourceAccount = useCallback(async (rpcUrl: string, creator: string, label: string) => {
    // The same encoder the deploy call uses, so the predicted address and the deployed one cannot drift.
    const res = await callViewRaw(
      rpcUrl,
      DAO_CONTRACTS_VAULT,
      VAULT_MODULE,
      "predict_next_contract_address",
      [],
      [creator, labelToHex(label)]
    );
    return normalizeAddressHex(firstViewResult(res));
  }, []);

  /** Pure view: the proxy that would govern a donated EOA. */
  const predictEoaProxy = useCallback(async (rpcUrl: string, eoa: string) => {
    const res = await callViewRaw(rpcUrl, DAO_CONTRACTS_VAULT, VAULT_MODULE, "predict_eoa_proxy_address", [], [eoa]);
    return normalizeAddressHex(firstViewResult(res));
  }, []);

  /**
   * Pure view: does the factory already hold a record for this address?
   *
   * Needed because the deploy target is derived from the creator and is NOT the creator's own address, so
   * auditing the connected wallet says nothing about whether the target is free. Without this, a creator who
   * had already deployed saw an "unmanaged" verdict for their wallet, kept being offered the deploy form,
   * and every submission aborted on `E_ALREADY_INITIALIZED`.
   */
  const isFactoryManaged = useCallback(async (rpcUrl: string, addr: string) => {
    const res = await callViewRaw(rpcUrl, DAO_CONTRACTS_VAULT, VAULT_MODULE, "is_factory_managed", [], [addr]);
    return firstViewResult(res) === true;
  }, []);

  return { verdict, isAuditing, error, audit, predictResourceAccount, predictEoaProxy, isFactoryManaged };
}