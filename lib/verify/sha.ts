/** Lowercase SHA-256 of a UTF-8 string, using the platform WebCrypto. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256HexUpper(text: string): Promise<string> {
  return (await sha256Hex(text)).toUpperCase();
}
