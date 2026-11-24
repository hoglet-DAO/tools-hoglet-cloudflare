import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { VerifyEnv } from "./store";

/** Server-only. `store.ts` stays free of this import so its tests run outside Workers. */
export function verifyEnv(): VerifyEnv {
  return getCloudflareContext().env as unknown as VerifyEnv;
}
