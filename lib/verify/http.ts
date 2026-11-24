import { NextResponse } from "next/server";
import { verifyEnv } from "./env";
import type { VerifyEnv } from "./store";

export const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/**
 * Bindings are absent under plain `next dev`. The API says so with 503 instead
 * of throwing, so the page can show "verification unavailable in dev".
 */
export function envOr503(): { ok: true; env: VerifyEnv } | { ok: false; response: NextResponse } {
  try {
    return { ok: true, env: verifyEnv() };
  } catch {
    return {
      ok: false,
      response: json({ ok: false, error: "verification storage is unavailable" }, 503),
    };
  }
}
