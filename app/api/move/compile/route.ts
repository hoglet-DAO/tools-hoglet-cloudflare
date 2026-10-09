// app/api/move/compile/route.ts
import { NextResponse } from "next/server";
import {
  COMPILE_TOKEN,
  COMPILE_MAX_BODY_BYTES,
  compileMove,
  validateFiles,
} from "@/lib/move/compileService";
import { clientKey, pruneBuckets, rateLimited } from "@/lib/move/rateLimit";

/**
 * Server-side proxy for the Move compile service.
 *
 * The bearer token lives only here. A browser-side call would expose it to anyone opening devtools,
 * and it would then travel with every request from every visitor.
 *
 * This endpoint is a shared resource on purpose — that is the point of the proxy — so it is rate
 * limited per client IP. Without it, one caller could saturate the VPS (concurrency 1) and make the
 * compiler unusable for everyone, which is the same 503 storm the retry logic would then be absorbing.
 */

/**
 * A compile may run 300 s upstream, and the retry budget adds headroom on top. This has to clear the
 * client's own total budget or the platform would kill the handler mid-compile and the client would see a
 * dead connection instead of the 504 the service actually produced.
 */
export const maxDuration = 600;

export async function POST(request: Request) {
  if (!COMPILE_TOKEN) {
    // Fail closed rather than proxying without credentials: an unauthenticated call would only earn a
    // 401 upstream, and reporting "not configured" locally is the actionable message.
    return NextResponse.json(
      { ok: false, error: "compile service is not configured (MOVE_COMPILE_TOKEN missing)" },
      { status: 503 }
    );
  }

  const key = clientKey(request);
  pruneBuckets(Date.now());
  if (rateLimited(key)) {
    return NextResponse.json(
      { ok: false, error: "too many compile requests, retry shortly" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // Reject an oversized body before parsing it. Measuring the raw text is cheaper and stricter than
  // checking the size of the parsed object, and it avoids buffering a payload we are going to refuse.
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

  // Advanced compile options, validated rather than forwarded blindly: they steer what the service builds,
  // so an unexpected value is worse than falling back to the default.
  const body = parsed as any;
  const includedArtifacts =
    body?.included_artifacts === "none" ||
    body?.included_artifacts === "sparse" ||
    body?.included_artifacts === "all"
      ? body.included_artifacts
      : undefined;
  const overrideSizeCheck =
    typeof body?.override_size_check === "boolean" ? body.override_size_check : undefined;

  // Forward the client's abort so a navigating user does not hold an upstream compile slot for 180s.
  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort());

  const result = await compileMove(validated.files, COMPILE_TOKEN, {
    signal: controller.signal,
    includedArtifacts,
    overrideSizeCheck,
  });

  // A transport failure after every retry maps to 502; a busy upstream maps to 503 so the caller can
  // distinguish "try again in a moment" from "we could not reach it".
  if (!result.ok) {
    // `result` is the failure arm of the union here; `status` only exists on that arm, so the narrow
    // on `ok` is what makes it visible to the type checker.
    const upstream = result.status;
    const status = upstream === 503 || upstream === 504 ? 503 : 502;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "move-compile-proxy" });
}