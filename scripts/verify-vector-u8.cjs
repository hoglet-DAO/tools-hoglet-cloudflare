#!/usr/bin/env node
/**
 * Reproduces the `vector<u8>` argument path end to end for the exact inputs that were failing.
 *
 * It mirrors `utils/moveParser.ts` (parse) and `utils/supra/bcs.ts` (serialize) using the SDK's BCS,
 * so the reported failure and its fix can be checked without a browser.
 *
 * Usage: node scripts/verify-vector-u8.cjs
 */
const { BCS } = require("supra-l1-sdk");

/* ---- fixed parseMoveArgument for vector<u8> (mirrors utils/moveParser.ts) ---- */
/** Mirrors utils/hex.ts hexToBytes: odd digit counts are LEFT-padded, never rejected. */
function hexToBytes(value) {
  let clean = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error(`"${value}" is not valid hex`);
  if (clean.length % 2 !== 0) clean = `0${clean}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  return out;
}

function bytesToHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += Number(bytes[i]).toString(16).padStart(2, "0");
  return `0x${out}`;
}

function normalizeHexBytes(value) {
  return bytesToHex(hexToBytes(value));
}

function parseByte(raw) {
  const token = raw.trim();
  if (token === "") throw new Error("Empty value where a byte (0-255) was expected");
  const value = /^0x[0-9a-fA-F]+$/.test(token) ? parseInt(token, 16) : Number(token);
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`"${token}" is not a byte: expected 0-255, or a 0x00-0xff hex value`);
  }
  return value;
}

function parseVectorU8(trimmed) {
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    return normalizeHexBytes(trimmed);
  }
  if (trimmed === "") return [];
  const tokens =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? (() => {
          try {
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed.map(String) : [trimmed];
          } catch {
            return [trimmed];
          }
        })()
      : trimmed.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  return tokens.map(parseByte);
}

/* ---- mirror of serializeValueByType's vector<u8> branch ---- */
function serializeVectorU8(value) {
  let bytes;
  if (typeof value === "string") {
    bytes = hexToBytes(value);
  } else if (Array.isArray(value)) {
    bytes = new Uint8Array(
      value.map((item) => {
        const u8 = typeof item === "string" ? parseInt(item, 10) : item;
        if (u8 < 0 || u8 > 255) throw new Error(`u8 value out of range in vector: ${u8}`);
        return u8;
      })
    );
  } else {
    throw new Error("unsupported");
  }

  const ser = new BCS.Serializer();
  ser.serializeU32AsUleb128(bytes.length);
  for (let i = 0; i < bytes.length; i++) ser.serializeU8(bytes[i]);
  return ser.getBytes();
}

const ZERO_KEY = "0x0000000000000000000000000000000000000000000000000000000000000000";
const USER_HEX = "0xe799069a01bcb4e79a714d685a0fa850e644d9b0d973844ad37dd46b543570c9";
/** The address the user hit: 63 digits because the chain trimmed the leading zero. */
const TRUNCATED_ADDRESS = "0xfec116479f1fd3cb9732cc768e6061b0e45b178a610b9bc23c2143a6493e794";

// Cases that must succeed. Odd digit counts pad rather than fail: the chain trims leading zeros, so
// `0xfec…794` (63 digits) is a real 32-byte address value.
const cases = [
  ["single hex blob (the fix)", ZERO_KEY],
  ["single hex blob (user's value)", USER_HEX],
  ["one byte written 0x00", "0x00"],
  ["odd 0x0 -> pads to 0x00", "0x0"],
  ["odd 0xabc -> pads to 0x0abc", "0xabc"],
  ["63-digit address -> pads to 32 bytes", TRUNCATED_ADDRESS],
  ["comma-separated bytes", "0x00, 0xff, 10"],
  ["empty", ""],
];

// Cases that must be rejected with a clear reason.
const mustThrow = [
  ["VectorInput output (was: float 1.0475e77)", `["0","${USER_HEX}"]`],
  ["bare 0x", "0x"],
];

let failures = 0;
for (const [label, input] of cases) {
  try {
    const parsed = parseVectorU8(input.trim());
    const bytes = serializeVectorU8(parsed);
    const hex = Buffer.from(bytes).toString("hex");
    console.log(`OK   ${label}\n     input  = ${input.slice(0, 60)}${input.length > 60 ? "…" : ""}`);
    console.log(`     parsed = ${Array.isArray(parsed) ? JSON.stringify(parsed) : "hex string (kept)"}`);
    console.log(`     bcs    = 0x${hex}\n`);
  } catch (e) {
    console.log(`FAIL ${label}\n     input  = ${input.slice(0, 60)}${input.length > 60 ? "…" : ""}`);
    console.log(`     reason = ${e.message}\n`);
    failures++;
  }
}

console.log("-- inputs that must be rejected --");
for (const [label, input] of mustThrow) {
  try {
    const parsed = parseVectorU8(input.trim());
    serializeVectorU8(parsed);
    console.log(`FAIL ${label}\n     was accepted as ${JSON.stringify(parsed)}\n`);
    failures++;
  } catch (e) {
    console.log(`OK   ${label}\n     rejected: ${e.message}\n`);
  }
}

console.log(failures === 0 ? "vector<u8> path verified" : `${failures} unexpected failure(s)`);
process.exit(failures ? 1 : 0);