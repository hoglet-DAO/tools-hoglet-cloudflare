#!/usr/bin/env node
/**
 * Builds the EOA signer-capability offer payload exactly as lib/governance/offerChallenge.ts does,
 * but with the SDK directly, so the byte layout can be inspected without a browser or a wallet.
 *
 *   SignedMessage<SignerCapabilityOfferProofChallengeV2>:
 *     type_info.account_address   address       -> 32
 *     type_info.module_name       vector<u8>    -> uleb len + bytes
 *     type_info.struct_name       vector<u8>    -> uleb len + bytes
 *     inner.sequence_number       u64           -> 8
 *     inner.source_address        address       -> 32
 *     inner.recipient_address     address       -> 32
 *
 * Usage: node scripts/verify-offer-challenge.cjs [sequenceNumber] [source] [recipient]
 */
let BCS, TxnBuilderTypes;
try {
  ({ BCS, TxnBuilderTypes } = require("supra-l1-sdk"));
} catch (e) {
  console.error("Could not load supra-l1-sdk:", e.message);
  process.exit(1);
}

const sequenceNumber = BigInt(process.argv[2] || "7");
const source = process.argv[3] || "0x1111111111111111111111111111111111111111111111111111111111111111";
const recipient = process.argv[4] || "0x2222222222222222222222222222222222222222222222222222222222222222";

const MODULE_ADDRESS = "0x1";
const MODULE_NAME = "account";
const STRUCT_NAME = "SignerCapabilityOfferProofChallengeV2";

const addressBytes = (a) => BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex(a));
const strBytes = (s) => BCS.bcsSerializeStr(s);
const u64Bytes = (n) => BCS.bcsSerializeUint64(BigInt(n));

const parts = [
  addressBytes(MODULE_ADDRESS),
  strBytes(MODULE_NAME),
  strBytes(STRUCT_NAME),
  u64Bytes(sequenceNumber),
  addressBytes(source),
  addressBytes(recipient),
];

const total = parts.reduce((n, p) => n + p.length, 0);
const out = new Uint8Array(total);
let off = 0;
for (const p of parts) {
  out.set(p, off);
  off += p.length;
}

const hex = "0x" + Buffer.from(out).toString("hex");

const EXPECTED = {
  "type_info.account_address": 32,
  "type_info.module_name(account)": 1 + MODULE_NAME.length,
  "type_info.struct_name(...V2)": 1 + STRUCT_NAME.length,
  "inner.sequence_number": 8,
  "inner.source_address": 32,
  "inner.recipient_address": 32,
};

let expectedTotal = 0;
console.log("segment sizes:");
for (const [name, size] of Object.entries(EXPECTED)) {
  console.log(`  ${name.padEnd(32)} ${size}`);
  expectedTotal += size;
}

console.log(`\nexpected total: ${expectedTotal}`);
console.log(`actual total:   ${total}`);
console.log(`payload length: ${hex.length - 2} hex chars`);
console.log(`\n${hex}`);

if (total !== expectedTotal) {
  console.error("\nMISMATCH: layout does not add up");
  process.exit(1);
}
// A well-formed address is 32 bytes; verify the SDK agrees with our assumption.
if (addressBytes(source).length !== 32) {
  console.error("MISMATCH: address is not 32 bytes");
  process.exit(1);
}
console.log("\nlayout verified");