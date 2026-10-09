// app/api/move/test/route.ts
import { NextResponse } from "next/server";
import { COMPILE_TOKEN, COMPILE_MAX_BODY_BYTES, runMoveTests, validateFiles } from "@/lib/move/compileService";
import { clientKey, pruneBuckets, rateLimited } from "@/lib/move/rateLimit";

/**
 * Server-side proxy for the Move test runner.
 *
 * Same reasoning as the compile proxy: the bearer token lives only here, and the endpoint is a shared,
 * serialised resource on the VPS. The request shape is identical, so the validation, the size ceiling and
 * the rate limit are shared rather than reimplemented.
 */

export const maxDuration = 600;

export async function POST(request: Request) {
  if (!COMPILE_TOKEN) {
    return NextResponse.json(
      { ok: false, error: "compile service is not configured (MOVE_COMPILE_TOKEN missing)" },
      { status: 503 }
    );
  }

  const key = clientKey(request);
  pruneBuckets(Date.now());
  if (rateLimited(key)) {
    return NextResponse.json(
      { ok: false, error: "too many requests, retry shortly" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const raw = await request.text();
  if (raw.length > COMPILE_MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload too large" }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const validated = validateFiles((parsed as any)?.files);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort());

  const result = await runMoveTests(validated.files, COMPILE_TOKEN, { signal: controller.signal });

  if (!result.ok) {
    const upstream = result.status;
    const status = upstream === 503 || upstream === 504 ? 503 : 502;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result, { status: 200 });
}