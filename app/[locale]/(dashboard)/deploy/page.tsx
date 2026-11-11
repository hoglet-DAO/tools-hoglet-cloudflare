"use client";

import { GovernanceHub } from "@/components/governance/GovernanceHub";

/**
 * Deploy: the half of the lifecycle that acts on modules the factory owns.
 *
 * Deploying a keyless module, handing it to an admin, upgrading it, and sealing it for good.
 * Account-level actions live under /account-control, and the contracts you already own under
 * /my-contracts.
 *
 * The route is `/deploy` rather than the old `/governance` because that is what it does. "Governance"
 * named the module it talks to, not the action the visitor came for, and it read as a second, competing
 * surface next to Account Control. A redirect from the old path keeps existing links working.
 */
export default function DeployPage() {
  return <GovernanceHub mode="contracts" />;
}