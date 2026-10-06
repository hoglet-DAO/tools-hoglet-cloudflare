/**
 * Byte-array hex helpers shared by the argument parser and the BCS serializer.
 *
 * Both used to carry their own copy of the "split into byte pairs" rule, which is exactly how the
 * same off-by-one had to be fixed twice: `.{1,2}` turned a trailing nibble into a whole byte, so
 * `0xabc` silently became `ab 0c`. One implementation means one place to get it right.
 */

/** Accepts input with or without the `0x` prefix. */
function stripPrefix(value: string): string {
  return value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
}

/**
 * Decodes hex into bytes.
 *
 * An odd digit count is LEFT-PADDED rather than rejected. The chain trims leading zeros whenever it
 * emits an address, key or hash, so a 63-digit value is a real 32-byte value missing its leading
 * zero — not a mistake. Rejecting it made byte arrays stricter than `address`, even though both
 * describe the same 32-byte facts, and it blocked legitimate copy-pasted values.
 *
 * Left, never right: hex is read most-significant-nibble first, so padding on the right would
 * silently produce a different value.
 */
export function hexToBytes(value: string): Uint8Array {
  let clean = stripPrefix(value.trim());

  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error(`"${value}" is not valid hex`);
  }
  if (clean.length % 2 !== 0) {
    clean = `0${clean}`;
  }

  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

/** The canonical `0x`-prefixed, even-length, lowercase form of a hex value. */
export function normalizeHexBytes(value: string): string {
  return bytesToHex(hexToBytes(value));
}

/** `0x`-prefixed lowercase hex. */
export function bytesToHex(bytes: Uint8Array | number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += Number(bytes[i]).toString(16).padStart(2, "0");
  }
  return `0x${out}`;
}