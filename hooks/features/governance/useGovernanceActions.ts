"use client";

import { useCallback, useState } from "react";
import { useSupraWallet } from "@/context/SupraWalletContext";
import { useNetwork } from "@/context/NetworkContext";
import { formatSupraError } from "@/utils/supra/errors";
import {
  showTransactionSuccessAlert,
  showErrorToast,
  showWarningToast,
} from "@/utils/supra/alertService";
import { callViewRaw, firstViewResult } from "@/hooks/features/view/useView";
import {
  buildOfferChallengeHex,
  getAccountSequenceNumber,
  normalizeAddressHex,
  ED25519_SCHEME,
} from "@/lib/governance/offerChallenge";
import { GOVERNANCE_FACTORY } from "@/config/contracts";
import { ZERO_AUTH_KEY } from "@/utils/supra/constants";
import { trace, traceWarn } from "@/lib/debug";

/** The eight lifecycle entry points, with the module each one lives in. */
export const GOVERNANCE_ENTRIES = {
  deploy_autonomous_contract: { module: "governance", address: GOVERNANCE_FACTORY },
  donate_eoa_to_dao: { module: "governance", address: GOVERNANCE_FACTORY },
  cancel_eoa_delegation: { module: "governance", address: GOVERNANCE_FACTORY },
  upgrade_contract: { module: "governance", address: GOVERNANCE_FACTORY },
  renounce_resource_account: { module: "governance", address: GOVERNANCE_FACTORY },
  renounce_contract: { module: "governance", address: GOVERNANCE_FACTORY },
  transfer_admin: { module: "governance", address: GOVERNANCE_FACTORY },
  rotate_authentication_key_call: { module: "account", address: "0x1" },
} as const;

export type GovernanceEntry = keyof typeof GOVERNANCE_ENTRIES;

export interface ExecuteOptions {
  /** Positional arguments, already in the shape the Move ABI expects. */
  args?: any[];
  /** Generic type arguments. */
  typeArgs?: any[];
  /**
   * Feedback ownership. Success and failure are separate on purpose: a caller that renders an inline
   * receipt still wants the explorer link, and a caller that renders an inline error must not also
   * fire the toast — that was one failure announced twice.
   */
  silentSuccess?: boolean;
  silentFailure?: boolean;
}

/** What the EOA signed, kept so the UI can show it back before the transaction is submitted. */
export interface SignedOfferProof {
  source: string;
  recipient: string;
  sequenceNumber: string;
  challengeHex: string;
  signature: string;
  publicKey: string;
}

/**
 * Single execution path for the whole governance lifecycle.
 *
 * Every entry — factory calls and the framework key rotation alike — goes through here so they share
 * one serialization route (`sendRawTransaction` resolves the ABI on-chain and BCS-encodes), one error
 * translation (`formatSupraError`) and one success surface. The alternative, hand-rolling fetches per
 * entry, is what produced the duplicated proxy logic this replaced.
 */
export function useGovernanceActions() {
  const { sendRawTransaction, signRawHex, accounts, rpcUrl } = useSupraWallet();
  const { network } = useNetwork();
  const [pendingEntry, setPendingEntry] = useState<GovernanceEntry | null>(null);

  const wallet = accounts[0] || "";

  const execute = useCallback(
    async (entry: GovernanceEntry, options: ExecuteOptions = {}): Promise<string | undefined> => {
      const target = GOVERNANCE_ENTRIES[entry];
      if (!target) throw new Error(`Unknown governance entry: ${entry}`);

      setPendingEntry(entry);
      trace(`[governance:execute] ${entry}`, {
        module: `${target.address}::${target.module}`,
        args: options.args ?? [],
        typeArgs: options.typeArgs ?? [],
      });

      try {
        const txHash = await sendRawTransaction(
          target.address,
          target.module,
          entry,
          options.args ?? [],
          options.typeArgs ?? []
        );

        trace(`[governance:execute] ${entry} submitted ->`, txHash);

        // A wallet that declines the confirmation prompt resolves null/undefined instead of throwing.
        // That is neither a success nor an error, so it needs its own signal — otherwise the flow just
        // stops with no explanation at all. Deliberately NOT gated by `silentFailure`: callers silence
        // the *failure* toast because they render the error inline, but a cancel is not an error and
        // has nothing inline to show.
        if (!txHash) {
          trace(`[governance:execute] ${entry} cancelled in wallet`);
          showWarningToast(
            "Transaction cancelled",
            "You declined the request in your wallet. Nothing was sent."
          );
          return undefined;
        }

        if (!options.silentSuccess) {
          showTransactionSuccessAlert(txHash, network);
        }
        return txHash;
      } catch (error: any) {
        // Surface everything the wallet/RPC said; these errors are usually the only signal available.
        console.error(`[governance:execute] ${entry} FAILED ->`, {
          message: error?.message,
          code: error?.code,
          data: error?.data,
          error,
        });
        if (!options.silentFailure) {
          showErrorToast(
            "Transaction failed",
            formatSupraError(error) || "The transaction could not be submitted."
          );
        }
        throw error;
      } finally {
        setPendingEntry(null);
      }
    },
    [sendRawTransaction, network]
  );

  /**
   * Annihilates the connected account's private key: the step that makes renouncement real.
   *
   * Failure feedback stays inline (the panel renders it next to the button), so the shared toast is
   * suppressed; the success alert is kept because it carries the explorer link.
   */
  const burnPrivateKey = useCallback(
    () => {
      trace("[governance:burn] rotate_authentication_key_call", {
        account: wallet,
        newAuthKey: ZERO_AUTH_KEY,
      });
      return execute("rotate_authentication_key_call", {
        args: [ZERO_AUTH_KEY],
        silentFailure: true,
      });
    },
    [execute, wallet]
  );

  /**
   * Phase 1 of the EOA donation: read the sequence number the transaction will consume, derive the
   * proxy the contract itself will use, build the `SignedMessage` payload and have the wallet sign it.
   *
   * Nothing is submitted here. The proof is returned so the UI can show exactly what was authorized
   * before the user commits — and so a stale sequence number (someone else's transaction landed first)
   * can be re-signed deliberately instead of silently.
   */
  const signOfferProof = useCallback(
    async (source: string): Promise<SignedOfferProof> => {
      if (!source) throw new Error("Connect the EOA you want to donate");

      trace("[governance:proof] start", { source, factory: GOVERNANCE_FACTORY, rpcUrl });

      // The contract recomputes this recipient itself; the proof must commit to the same value.
      // `normalizeAddressHex` pads to 64 hex chars, because the fullnode trims leading zeros.
      const proxyRes = await callViewRaw(rpcUrl, GOVERNANCE_FACTORY, "governance", "predict_eoa_proxy_address", [], [source]);
      trace("[governance:proof] predict_eoa_proxy_address raw ->", proxyRes);

      const recipient = normalizeAddressHex(firstViewResult(proxyRes));
      if (!recipient) throw new Error("Could not derive the proxy address from the factory view");
      trace("[governance:proof] proxy normalized ->", recipient);

      const sourceAddr = normalizeAddressHex(source);
      if (!sourceAddr) throw new Error("Connected wallet address is not a valid Move address");

      const sequenceNumber = await getAccountSequenceNumber(rpcUrl, sourceAddr);
      trace("[governance:proof] sequence number ->", sequenceNumber.toString());

      const challengeHex = buildOfferChallengeHex({
        sequenceNumber,
        source: sourceAddr,
        recipient,
      });
      trace("[governance:proof] BCS payload", {
        hexChars: challengeHex.length - 2,
        bytes: (challengeHex.length - 2) / 2,
        challengeHex,
      });

      const { signature, publicKey } = await signRawHex(challengeHex, sequenceNumber.toString());
      trace("[governance:proof] wallet returned", {
        signatureLength: signature?.length,
        publicKeyLength: publicKey?.length,
        signature,
        publicKey,
      });

      return {
        source: sourceAddr,
        recipient,
        sequenceNumber: sequenceNumber.toString(),
        challengeHex,
        signature,
        publicKey,
      };
    },
    [rpcUrl, signRawHex]
  );

  /**
   * Phase 2: submit the donation with the captured proof. `account_scheme` is ED25519 because the
   * proof is an Ed25519 signature, which is what `account::offer_signer_capability` verifies.
   */
  const submitDonation = useCallback(
    async (daoAdmin: string, proof: SignedOfferProof) => {
      // The proof commits to a specific sequence number, and the framework re-reads it at execution
      // time. If the account advanced between signing and submitting, the signature can no longer
      // match, so catch that here with an actionable message instead of a generic proof failure.
      if (proof.source && proof.sequenceNumber) {
        const current = await getAccountSequenceNumber(rpcUrl, proof.source).catch(() => null);
        trace("[governance:donate] sequence re-check", {
          signed: proof.sequenceNumber,
          current: current?.toString(),
        });
        if (current !== null && current.toString() !== proof.sequenceNumber) {
          throw new Error(
            `The proof was signed at sequence ${proof.sequenceNumber} but the account is now at ${current}. ` +
              `Sign the proof again so it commits to the current value.`
          );
        }
      }

      // Argument order must match `donate_eoa_to_dao(eoa, dao_admin, sig, scheme, pubkey)` minus the
      // `&signer`, which the SDK drops from the ABI's param list.
      trace("[governance:donate] submit", {
        daoAdmin,
        signatureChars: proof.signature?.length,
        signatureBytes: (proof.signature?.length ?? 2) / 2 - 1,
        scheme: ED25519_SCHEME,
        publicKeyChars: proof.publicKey?.length,
        publicKeyBytes: (proof.publicKey?.length ?? 2) / 2 - 1,
        signaturePreview: proof.signature?.slice(0, 20),
        publicKeyPreview: proof.publicKey?.slice(0, 20),
      });

      return execute("donate_eoa_to_dao", {
        args: [daoAdmin, proof.signature, ED25519_SCHEME, proof.publicKey],
      });
    },
    [execute, rpcUrl]
  );

  /**
   * Undoes a donation while the key is still alive. This is the recovery path for a wrong DAO admin
   * or a donation sent from the wrong wallet: it revokes both offers and frees the EOA to donate
   * again. It stops being available the moment the key is annihilated.
   */
  const cancelDelegation = useCallback(
    (eoaAddr: string) => {
      trace("[governance:cancel] cancel_eoa_delegation", { eoa: eoaAddr });
      // Inline error, so the shared failure toast would be a second announcement of the same thing.
      return execute("cancel_eoa_delegation", { args: [eoaAddr], silentFailure: true });
    },
    [execute]
  );

  return {
    execute,
    burnPrivateKey,
    signOfferProof,
    submitDonation,
    cancelDelegation,
    pendingEntry,
    wallet,
    isPending: (e: GovernanceEntry) => pendingEntry === e,
  };
}