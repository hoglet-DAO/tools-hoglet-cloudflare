#!/usr/bin/env node
/**
 * Contrasts how the same literal behaves as an `address` versus as a `vector<u8>`.
 *
 * This is the distinction behind "0x1 works for an address but not for the key argument":
 *
 *   - `address` is a FIXED 32-byte type, so a short form is unambiguously left-padded with zeros
 *     (`0x1` === `0x0000…0001`). The chain and the SDK both do this.
 *   - `vector<u8>` is a VARIABLE-length byte array, so `0x1` is half a byte and there is no width to
 *     pad to. It has to be rejected, because guessing would invent data.
 *
 * Usage: node scripts/verify-address-vs-bytes.cjs
 */
const { BCS, TxnBuilderTypes } = require("supra-l1-sdk");

/* ---- mirrors lib/governance/offerChallenge.ts normalizeAddressHex ---- */
function normalizeAddressHex(value) {
  const body = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(body) || body.length > 64) return undefined;
  return `0x${body.padStart(64, "0")}`;
}

/* ---- mirrors utils/hex.ts hexToBytes: odd digit counts are LEFT-padded, never rejected ---- */
function hexToBytes(value) {
  let clean = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error(`"${value}" is not valid hex`);
  if (clean.length % 2 !== 0) clean = `0${clean}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  return out;
}

const literal = "0xf13";
const samples = [literal, "0x1", "0x0"];

console.log(`-- as an \`address\` (fixed 32 bytes): short forms pad --`);
for (const v of samples) {
  const norm = normalizeAddressHex(v);
  const bcs = Buffer.from(BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex(v))).toString("hex");
  console.log(`   ${v.padEnd(8)} -> ${norm}`);
  console.log(`   ${" ".repeat(8)}    bcs = ${bcs}  (${bcs.length / 2} bytes)`);
}

console.log(`\n-- as a \`vector<u8>\` (variable length): the same left-padding applies --`);
for (const v of samples) {
  const bytes = hexToBytes(v);
  console.log(`   ${v.padEnd(8)} -> ${bytes.length} byte(s): ${Buffer.from(bytes).toString("hex")}`);
}

console.log(`\n-- the burn value, which IS 64 digits --`);
const ZERO_AUTH_KEY = "0x0000000000000000000000000000000000000000000000000000000000000000";
const bytes = hexToBytes(ZERO_AUTH_KEY);
console.log(`   ${ZERO_AUTH_KEY.slice(0, 12)}… -> OK, ${bytes.length} bytes (all zero: ${bytes.every((b) => b === 0)})`);
console.log(`   equals address ${normalizeAddressHex("0x0")}? ${ZERO_AUTH_KEY === normalizeAddressHex("0x0")}`);

console.log(
  `\nBoth types left-pad now. An \`address\` pads to a fixed 32 bytes; a \`vector<u8>\` pads to a whole\n` +
    `byte count. Same rule, different widths — which is why a 63-digit value is accepted in both.`
);