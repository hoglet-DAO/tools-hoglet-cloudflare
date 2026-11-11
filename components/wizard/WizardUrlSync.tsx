"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface WizardUrlSyncProps {
  selectedModuleName: string | undefined;
  onSelectModule: (mod: any) => void;
  modules: any[];
}

/**
 * Keeps `?module=` in the URL in step with the selected module.
 *
 * This used to own the address too — it read `?address` on mount, scanned from it, and wrote it back —
 * and `TaskWizard` read the same parameter independently to do the same two things. Every shared link
 * therefore scanned the contract twice. The address is now owned in one place by `useAddressSubject`;
 * what remains here is the part that is genuinely interactor-specific, which is the selected module:
 * it is meaningless in the inspector, where the URL carries an account rather than a function.
 *
 * Writing the parameter still copies the current search params and touches only `module`, so the
 * address the hook wrote — and the `?network` the network context owns — both survive a module change.
 */
export function WizardUrlSync({ selectedModuleName, modules, onSelectModule }: WizardUrlSyncProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [hasInitialized, setHasInitialized] = useState(false);

  // Selects the module named in the URL, once the modules for this contract have arrived.
  useEffect(() => {
    if (hasInitialized || modules.length === 0) return;
    setHasInitialized(true);

    const urlModule = searchParams.get("module");
    if (urlModule && !selectedModuleName) {
      const found = modules.find((m) => m.name === urlModule);
      if (found) onSelectModule(found);
    }
  }, [hasInitialized, modules, searchParams, selectedModuleName, onSelectModule]);

  // Writes the selection back. Guarded so it never fires before the URL read has had its turn.
  useEffect(() => {
    if (!hasInitialized) return;

    const current = searchParams.get("module");
    if (selectedModuleName === current) return;

    const params = new URLSearchParams(searchParams.toString());
    if (selectedModuleName) params.set("module", selectedModuleName);
    else params.delete("module");

    const search = params.toString();
    router.replace(`${pathname}${search ? `?${search}` : ""}`, { scroll: false });
  }, [selectedModuleName, hasInitialized, pathname, router, searchParams]);

  return null;
}