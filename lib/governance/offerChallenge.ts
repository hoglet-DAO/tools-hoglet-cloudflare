import { addressToUint8Array, serializeString, serializeUint64 } from "@/utils/supra/bcs";
import { bytesToHex } from "@/utils/hex";
import { trace, traceWarn } from "@/lib/debug";

/**
 * Builds the exact byte payload the framework verifies for an EOA signer-capability offer.
 *
 * `account::offer_signer_capability` verifies with
 * `ed25519::signature_verify_strict_t(sig, pk, challenge)`. That helper does NOT sign the challenge
 * alone — it wraps it first (verified in aptos-stdlib/sources/cryptography/ed25519.move):
 *
 *     let encoded = SignedMessage { type_info: type_info::type_of<T>(), inner: data };
 *     signature_verify_strict_internal(sig, pk, bcs::to_bytes(&encoded))
 *
 * So the signed bytes are the BCS of `SignedMessage`, which is:
 *
 *   TypeInfo                                   (BcsTypeInfo)
 *     account_address : address                -> 32 bytes
 *     module_name     : vector<u8>             -> uleb length + bytes
 *     struct_name     : vector<u8>             -> uleb length + bytes
 *   inner: SignerCapabilityOfferProofChallengeV2
 *     sequence_number : u64                    -> 8 bytes little-endian
 *     source_address  : address                -> 32 bytes
 *     recipient_address: address               -> 32 bytes
 *
 * Getting a single byte wrong produces an opaque `EINVALID_PROOF_OF_KNOWLEDGE` at runtime, so the
 * layout is spelled out here and every field is built with the shared BCS helpers.
 */

/** `supra_framework::account` — the module that defines the challenge type. */
const CHALLENGE_MODULE_ADDRESS = "0x1";
const CHALLENGE_MODULE_NAME = "account";
const CHALLENGE_STRUCT_NAME = "SignerCapabilityOfferProofChallengeV2";

/** Scheme identifier for ED25519, mirroring `account::ED25519_SCHEME`. */
export const ED25519_SCHEME = 0;

export interface OfferChallengeInput {
  /** The EOA's sequence number *at the moment the donate transaction will execute*. */
  sequenceNumber: bigint | string | number;
  /** The EOA delegating its signer capability. */
  source: string;
  /** The recipient of the delegation — the EOA's deterministic proxy Resource Account. */
  recipient: string;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Move returns an `address` as a BCS byte array over raw JSON-RPC, while the Supra fullnode returns
 * it as a hex string with leading zero bytes TRIMMED (e.g. `0x1`, not `0x0000…0001`). Accept either
 * shape and normalize to a full 64-hex-character address so downstream length checks and display are
 * stable rather than dependent on how many leading zeros the value happened to have.
 */
export function normalizeAddressHex(value: unknown): string | undefined {
  let body: string;

  if (typeof value === "string") {
    body = value.startsWith("0x") ? value.slice(2) : value;
  } else if (Array.isArray(value) && value.every((b) => typeof b === "number" && b >= 0 && b <= 255)) {
    body = bytesToHex(Uint8Array.from(value as number[])).slice(2);
  } else {
    return undefined;
  }

  // `+`, not `*`: an empty body ("" or "0x") is invalid input, not the null address. With `*` both
  // collapsed to 0x0000…0000, which would make "no address" compare equal to the zero address.
  if (!/^[0-9a-fA-F]+$/.test(body) || body.length > 64) return undefined;
  return `0x${body.padStart(64, "0")}`;
}

/**
 * Address equality that tolerates the short forms the chain and wallets both emit.
 *
 * `0xa`, `a` and `0x0000…000a` are the same account, but as strings they are three different values.
 * Comparing them raw is how "is this audited address my connected wallet?" silently answers no for a
 * short-hand address — turning owner-only actions into a read-only preview for no reason.
 */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = normalizeAddressHex(a);
  const nb = normalizeAddressHex(b);
  return !!na && !!nb && na === nb;
}

/** The BCS payload the EOA must sign for the delegation proof to be accepted. */
export function buildOfferChallengeBytes(input: OfferChallengeInput): Uint8Array {
  const typeInfo = concat([
    addressToUint8Array(CHALLENGE_MODULE_ADDRESS),
    serializeString(CHALLENGE_MODULE_NAME),
    serializeString(CHALLENGE_STRUCT_NAME),
  ]);

  const inner = concat([
    serializeUint64(input.sequenceNumber),
    addressToUint8Array(input.source),
    addressToUint8Array(input.recipient),
  ]);

  return concat([typeInfo, inner]);
}

export function buildOfferChallengeHex(input: OfferChallengeInput): string {
  return bytesToHex(buildOfferChallengeBytes(input));
}

/**
 * Reads an account's current sequence number through the cached RPC proxy.
 *
 * The proof commits to this value, and a transaction consumes exactly the sequence number the
 * account held when it began executing, so it must be read immediately before signing. If another
 * transaction from the same account lands first, the signature stops being valid and the whole
 * donation has to be redone — the caller surfaces that as an explicit error rather than retrying,
 * because a silent retry would re-sign with a value the user never saw.
 */
export async function getAccountSequenceNumber(rpcUrl: string, address: string): Promise<bigint> {
  const isMainnet = rpcUrl?.includes("mainnet");
  const proxyPath = isMainnet ? "/api/rpc/mainnet" : "/api/rpc/testnet";
  const res = await fetch(`${proxyPath}/accounts/${address}`);
  if (!res.ok) throw new Error(`Could not read the account (${res.status})`);
  const data = await res.json();
  trace("[governance:proof] account response", { address, status: res.status, data });
  const raw = data?.sequence_number ?? data?.sequenceNumber;
  if (raw === undefined || raw === null) throw new Error("Account has no sequence number");
  return BigInt(raw);
}