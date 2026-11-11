import { NextResponse } from "next/server";
import { DAO_CONTRACTS_VAULT } from "@/config/contracts";
import { buildVaultGuideText } from "@/lib/vault/context";

/**
 * Machine guide for the DAO Contracts Vault, following the same llms.txt spirit as /llms.txt and
 * /llm.txt: a plain-text reference an agent can fetch once and operate from.
 *
 * The facts it carries (seeds, address derivation, status gates, fee bounds, error codes) are the ones a
 * model cannot invent and gets wrong in practice — the seed rename from `governance_factory::...` to
 * `dao_contracts_vault::...` is exactly the kind of drift this route exists to kill. It is generated
 * from `config/vault.ts`, which `npm run check:vault` pins to the Move sources.
 */
export async function GET() {
  const body = buildVaultGuideText(DAO_CONTRACTS_VAULT);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
