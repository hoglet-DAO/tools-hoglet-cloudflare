"use client";

import { MyContractsHub } from "@/components/governance/MyContractsHub";

/**
 * My contracts: manage the modules *this* wallet deployed through the factory — upgrade, transfer
 * admin, or renounce them — as a dedicated, deliberate destination rather than behind a paste in the
 * general audit screen. Its own surface because the actions here are irreversible in one path.
 */
export default function MyContractsPage() {
  return <MyContractsHub />;
}
