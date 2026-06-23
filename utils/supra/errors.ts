export function formatSupraError(error: any): string {
  if (!error) return "Unknown error occurred.";

  let errStr = typeof error === 'string' ? error : error.message || "Unknown error occurred.";

  // Clean up massive Rust backtraces from Supra RPC
  const backtraceIndex = errStr.indexOf("Backtrace:");
  if (backtraceIndex !== -1) {
    errStr = errStr.substring(0, backtraceIndex).trim();
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
