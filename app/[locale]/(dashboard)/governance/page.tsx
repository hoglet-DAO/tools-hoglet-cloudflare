"use client";

import { GovernanceHub } from "@/components/governance/GovernanceHub";

/**
 * Contract Governance: the half of the lifecycle that acts on modules the factory owns.
 *
 * Deploying a keyless module, handing it to a DAO admin, upgrading it, and sealing it for good.
 * Account-level actions live under /account-control.
 */
export default function GovernancePage() {
  return <GovernanceHub mode="contracts" />;
}