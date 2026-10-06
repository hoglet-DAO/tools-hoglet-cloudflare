#!/usr/bin/env node
/**
 * Checks that addresses are treated as 32-byte accounts regardless of how they are written.
 *
 * `0xa`, `a` and `0x0000…000a` are the same account. The chain and the wallets both emit short
 * forms, so anything that compares or serializes addresses has to normalize first — otherwise
 * owner-only actions silently answer "not you" for a shorthand address.
 *
 * Usage: node scripts/verify-address-handling.cjs
 */
const { BCS, TxnBuilderTypes } = require("supra-l1-sdk");

/* ---- mirrors lib/governance/offerChallenge.ts ---- */
function normalizeAddressHex(value) {
  let body;
  if (typeof value === "string") body = value.startsWith("0x") ? value.slice(2) : value;
  else if (Array.isArray(value) && value.every((b) => typeof b === "number" && b >= 0 && b <= 255)) {
    body = Buffer.from(value).toString("hex");
  } else return undefined;

  if (!/^[0-9a-fA-F]+$/.test(body) || body.length > 64) return undefined;
  return `0x${body.padStart(64, "0")}`;
}

function sameAddress(a, b) {
  if (!a || !b) return false;
  const na = normalizeAddressHex(a);
  const nb = normalizeAddressHex(b);
  return !!na && !!nb && na === nb;
}

const PADDED = "0x000000000000000000000000000000000000000000000000000000000000000a";
let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label} -> ${actual}${ok ? "" : ` (expected ${expected})`}`);
};

console.log("-- equality across written forms --");
check("0xa == padded", sameAddress("0xa", PADDED), true);
check("a == padded", sameAddress("a", PADDED), true);
check("0xa == a", sameAddress("0xa", "a"), true);
check("padded == padded", sameAddress(PADDED, PADDED), true);
check("0xa != 0xb", sameAddress("0xa", "0xb"), false);
check("empty is never equal", sameAddress("", PADDED), false);
check("garbage is never equal", sameAddress("not-an-address", PADDED), false);

console.log("\n-- normalization --");
check("normalize 0xa", normalizeAddressHex("0xa"), PADDED);
check("normalize a", normalizeAddressHex("a"), PADDED);
check("normalize keeps 32-byte input", normalizeAddressHex(PADDED), PADDED);
check("normalize byte array", normalizeAddressHex([0, 0, 10]), `0x${"0".repeat(61)}00a`);
check("rejects too-long hex", normalizeAddressHex("0x" + "a".repeat(65)), undefined);
check("rejects empty string", normalizeAddressHex(""), undefined);
check("rejects bare 0x", normalizeAddressHex("0x"), undefined);

console.log("\n-- the null address --");
const ZERO = `0x${"0".repeat(64)}`;
check("normalize 0x0", normalizeAddressHex("0x0"), ZERO);
check("normalize 0x00", normalizeAddressHex("0x00"), ZERO);
check("0x0 == 0x00", sameAddress("0x0", "0x00"), true);
check("0x0 == full zero address", sameAddress("0x0", ZERO), true);
check("empty != 0x0", sameAddress("", "0x0"), false);
check("0x != 0x0", sameAddress("0x", "0x0"), false);
check("0x0 != 0x1", sameAddress("0x0", "0x1"), false);

console.log("\n-- BCS: every form serializes to the same 32 bytes --");
const ser = (a) => Buffer.from(BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex(a))).toString("hex");
const fromShort = ser("0xa");
check("short form bytes == padded bytes", fromShort, ser(PADDED));
check("short form is 32 bytes", fromShort.length, 64);

console.log(failures === 0 ? "\naddress handling verified" : `\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);