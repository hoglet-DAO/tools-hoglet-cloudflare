export function formatSupraError(error: any): string {
  if (!error) return "Unknown error occurred.";

  let errStr = typeof error === 'string' ? error : error.message || "Unknown error occurred.";

  // Clean up massive Rust backtraces from Supra RPC
  const backtraceIndex = errStr.indexOf("Backtrace:");
  if (backtraceIndex !== -1) {
    errStr = errStr.substring(0, backtraceIndex).trim();
  }

  // The most informative shape Supra returns for a rejected call. Keep the module, the symbolic
  // name and the numeric code: together they name both the failing module and the exact assert.
  //   Move abort in 0x1::account: EINVALID_PROOF_OF_KNOWLEDGE(0x10005)
  const moveAbort = errStr.match(
    /Move abort in (0x[0-9a-fA-F]+)::([A-Za-z0-9_]+):\s*([A-Za-z0-9_]*)\((0x[0-9a-fA-F]+|[0-9]+)\)/
  );
  if (moveAbort) {
    const [, addr, module, name, code] = moveAbort;
    const label = name ? `${name} ` : "";
    return `Move abort in ${addr}::${module}: ${label}(code ${code})`;
  }

  // Extract VMError specifics
  const vmMatch = errStr.match(/VMError\s*\{\s*major_status:\s*([^,]+)(?:[\s\S]*?message:\s*Some\("([^"]+)"\))?/);
  if (vmMatch) {
    const status = vmMatch[1];
    const msg = vmMatch[2];
    errStr = msg ? `Contract Error: ${status} - ${msg}` : `Contract Error: ${status}`;
  } else if (errStr.length > 200) {
    // Truncate other extremely long errors just in case
    errStr = errStr.substring(0, 150) + "...";
  }

  return errStr;
}
