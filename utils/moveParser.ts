/**
 * Parses user input strings into actual Javascript types required by the Move/Supra JSON RPC
 * Handles vectors permissively (e.g. "1, 2, 3" -> [1, 2, 3])
 */

import { normalizeHexBytes } from "@/utils/hex";

/**
 * Parses a single byte from either `0x` hex or decimal notation.
 *
 * Rejects anything that is not an integer in 0..255. The old path used `Number()`, which silently
 * turns a long hex string like `0xe799069a…` into `1.0475e+77` — a value that is not a byte at all
 * and only failed much later, inside BCS serialization, with an error that pointed nowhere near the
 * real mistake.
 */
function parseByte(raw: string): number {
  const token = raw.trim();
  if (token === "") throw new Error("Empty value where a byte (0-255) was expected");

  const value = /^0x[0-9a-fA-F]+$/.test(token) ? parseInt(token, 16) : Number(token);
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`"${token}" is not a byte: expected 0-255, or a 0x00-0xff hex value`);
  }
  return value;
}

export function parseMoveArgument(val: string, paramType: string): any {
  if (val === undefined || val === null) return val;
  const trimmed = val.trim();

  // 1. Handle Vectors (Arrays)
  if (paramType.startsWith("vector<")) {
    // Extract inner type, e.g. "vector<u8>" -> "u8", or "vector<address>" -> "address"
    const innerMatch = paramType.match(/vector<(.*)>/);
    const innerType = innerMatch ? innerMatch[1].trim() : "u8";

    // `vector<u8>` is a byte blob, entered as ONE hex string — never a list of items. This has to be
    // checked before any splitting, because a long hex value is a perfectly valid byte sequence and
    // simultaneously a nonsense `u8`.
    if (innerType === "u8") {
      if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
        // Canonicalize through the shared decoder: it left-pads an odd digit count (the chain trims
        // leading zeros, so `0xfec…794` is a real 32-byte value), and returning the padded form means
        // the payload preview and the trace show exactly what gets sent.
        return normalizeHexBytes(trimmed);
      }
      if (trimmed === "") return [];

      // Still accept an explicit list, but parse each entry as a real byte.
      const tokens = trimmed.startsWith("[") && trimmed.endsWith("]")
        ? (() => {
            try {
              const parsed = JSON.parse(trimmed);
              return Array.isArray(parsed) ? parsed.map((item: any) => String(item)) : [trimmed];
            } catch {
              return [trimmed];
            }
          })()
        : trimmed.split(",").map((s) => s.trim()).filter((s) => s.length > 0);

      return tokens.map(parseByte);
    }

    // Attempt to parse as JSON first (e.g. if user wrote ["0x1", "0x2"])
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsedArray = JSON.parse(trimmed);
        if (Array.isArray(parsedArray)) {
          return parsedArray.map((item: any) => parseMoveArgument(String(item), innerType));
        }
      } catch (e) {
        console.warn("Failed to parse JSON array for Move Argument, falling back to comma-split", e);
      }
    }

    // Permissive comma-separated fallback (e.g. "1, 2, 3" or "0x1, 0x2")
    if (trimmed === "") return []; // empty array
    
    // We split by comma, but be careful not to split commas inside nested brackets (though usually Move inputs aren't that complex)
    const parts = trimmed.split(",").map(s => s.trim()).filter(s => s.length > 0);
    return parts.map(part => parseMoveArgument(part, innerType));
  }

  // 2. Handle Booleans
  if (paramType === "bool") {
    const lower = trimmed.toLowerCase();
    return lower === "true" || lower === "1" || lower === "yes" || lower === "t" || lower === "y";
  }

  // 3. Handle Smaller Numbers (u8, u16, u32) -> Return Number type
  if (paramType === "u8" || paramType === "u16" || paramType === "u32") {
    if (trimmed === "") return 0;
    // A bare `u8` is still a single byte, so the hex-vs-decimal ambiguity from a long string has to
    // be rejected here too rather than silently becoming a float.
    if (paramType === "u8") return parseByte(trimmed);

    const max = paramType === "u16" ? 65535 : 4294967295;
    const value = /^0x[0-9a-fA-F]+$/.test(trimmed) ? parseInt(trimmed, 16) : Number(trimmed);
    if (!Number.isInteger(value) || value < 0 || value > max) {
      throw new Error(`"${trimmed}" is not a valid ${paramType}: expected 0-${max}`);
    }
    return value;
  }

  // 4. Handle Large Numbers (u64, u128, u256) -> Return String type (prevents JS precision loss)
  if (paramType === "u64" || paramType === "u128" || paramType === "u256") {
    // Just return the raw string so it preserves full 256-bit width for JSON RPC
    return trimmed === "" ? "0" : trimmed;
  }

  // 5. Default (Address, String, Structs, etc) -> Return String type
  if (typeof trimmed === "string") {
    // If it looks like a struct (address::module::name) and is missing 0x
    if (trimmed?.includes("::") && !trimmed.startsWith("0x")) {
      return "0x" + trimmed;
    }
    // If it is an address and is missing 0x
    if (paramType === "address" && !trimmed.startsWith("0x")) {
      return "0x" + trimmed;
    }
  }

  return trimmed;
}

/**
 * Returns a smart placeholder string based on the Move paramType
 */
export function getSmartPlaceholder(paramType: any): string {
  if (typeof paramType !== 'string') {
    // If it's an object (like generic_type_params {"constraints": []}), fallback to generic placeholder
    return "e.g. 0x1::supra_coin::SupraCoin";
  }

  if (paramType.startsWith("vector<")) {
    const innerMatch = paramType.match(/vector<(.*)>/);
    const innerType = innerMatch ? innerMatch[1].trim() : "";
    
    if (innerType === "address") return "e.g. 0x1, 0x2";
    if (innerType === "u8") return "e.g. 0x0000… (hex bytes)";
    if (innerType === "u64") return "e.g. 100, 200";
    if (innerType === "0x1::string::String") return "e.g. word1, word2";
    return "e.g. val1, val2";
  }

  if (paramType === "bool") return "e.g. true or false";
  if (paramType === "address") return "e.g. 0x123...abc";
  if (paramType === "u64" || paramType === "u128" || paramType === "u256") return "e.g. 1000000";
  if (paramType === "0x1::string::String") return "e.g. 0x1::supra_coin::SupraCoin";
  
  return `Enter ${paramType}...`;
}
