/**
 * Parses user input strings into actual Javascript types required by the Move/Supra JSON RPC
 * Handles vectors permissively (e.g. "1, 2, 3" -> [1, 2, 3])
 */

export function parseMoveArgument(val: string, paramType: string): any {
  if (val === undefined || val === null) return val;
  const trimmed = val.trim();

  // 1. Handle Vectors (Arrays)
  if (paramType.startsWith("vector<")) {
    // Extract inner type, e.g. "vector<u8>" -> "u8", or "vector<address>" -> "address"
    const innerMatch = paramType.match(/vector<(.*)>/);
    const innerType = innerMatch ? innerMatch[1].trim() : "u8";

    // If it's a vector<u8> and starts with 0x, it's likely a hex string bytes array.
    if (innerType === "u8" && trimmed.startsWith("0x") && !trimmed.includes(",")) {
      // Return as hex string directly, or parse into number array?
      // Starkey usually accepts hex strings for vector<u8>. Let's keep it as hex string.
      return trimmed;
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
    const num = Number(trimmed);
    return isNaN(num) ? 0 : num;
  }

  // 4. Handle Large Numbers (u64, u128, u256) -> Return String type (prevents JS precision loss)
  if (paramType === "u64" || paramType === "u128" || paramType === "u256") {
    // Just return the raw string so it preserves full 256-bit width for JSON RPC
    return trimmed === "" ? "0" : trimmed;
  }

  // 5. Default (Address, String, Structs, etc) -> Return String type
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
    if (innerType === "u8") return "e.g. 0xabc or 1, 2, 3";
    if (innerType === "u64") return "e.g. 100, 200";
    if (innerType === "0x1::string::String") return "e.g. word1, word2";
    return "e.g. val1, val2";
  }

  if (paramType === "bool") return "e.g. true or false";
  if (paramType === "address") return "e.g. 0x123...abc";
  if (paramType === "u64" || paramType === "u128" || paramType === "u256") return "e.g. 1000000";
  if (paramType === "0x1::string::String") return "e.g. Hello World";
  
  return `Enter ${paramType}...`;
}
