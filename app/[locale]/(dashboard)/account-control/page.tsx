"use client";

import { GovernanceHub } from "@/components/governance/GovernanceHub";

/**
 * Account Control: the half of the lifecycle that acts on an account the visitor owns.
 *
 * Split from Contract Governance because the guarantees differ. A deployed module is owned by the
 * factory and can be upgraded or frozen by its DAO admin; an account is controlled by whoever holds
 * its key, and the actions here (donate, undo, burn) include the only irreversible one in the suite.
 */
export default function AccountControlPage() {
  return <GovernanceHub mode="accounts" />;
}