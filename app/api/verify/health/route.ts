import { COMPILE_TOKEN } from "@/lib/move/compileService";
import { verifyEnv } from "@/lib/verify/env";
import { json } from "@/lib/verify/http";
import type { VerifyEnv } from "@/lib/verify/store";

export async function GET() {
  const compile = Boolean(COMPILE_TOKEN);
  let env: VerifyEnv | null = null;
  try {
    env = verifyEnv();
  } catch {
    // Bindings are not available under plain `next dev`.
  }

  let d1 = false;
  let r2 = false;
  if (env) {
    try {
      await env.MOVE_VERIFY_DB.prepare("SELECT 1").first();
      d1 = true;
    } catch {}
    try {
      await env.MOVE_SOURCES.list({ limit: 1 });
      r2 = true;
    } catch {}
  }

  const ok = compile && d1 && r2;
  return json({ ok, compile, d1, r2 }, ok ? 200 : 503);
}
