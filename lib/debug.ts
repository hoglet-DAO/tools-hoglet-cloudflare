/**
 * Trace logging for the verification and governance paths.
 *
 * Everything prefixed `[governance:*]`, `[signRawHex]`, `[abi]` or `[callViewRaw]` is a diagnosis
 * aid, not product output. Gating it behind this constant keeps `next dev` fully traced while
 * production builds drop it: `process.env.NODE_ENV` is statically replaced by the bundler, so the
 * branches fold to `false` and the calls are eliminated.
 *
 * Failures deliberately keep using `console.error` directly — those are worth surfacing in
 * production too, where they are the only signal available from a user's session.
 */

export const DEBUG_TRACE = process.env.NODE_ENV !== "production";

export function trace(...args: unknown[]): void {
  if (DEBUG_TRACE) console.log(...args);
}

export function traceWarn(...args: unknown[]): void {
  if (DEBUG_TRACE) console.warn(...args);
}