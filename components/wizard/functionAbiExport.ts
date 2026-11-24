import { DAO_CONTRACTS_VAULT } from "@/config/contracts";
import { getVaultFunctionDocs } from "@/config/vault";
import { sameAddress } from "@/lib/governance/offerChallenge";

export interface FunctionModuleDetails {
  modAddr: string;
  modName: string;
}

export function extractModuleDetails(selectedModule: any, contractAddress?: string): FunctionModuleDetails {
  let modAddr = contractAddress || "unknown";
  let modName = selectedModule?.name || "unknown";
  if (selectedModule?.name && selectedModule.name?.includes("::")) {
    const parts = selectedModule.name.split("::");
    modAddr = parts[0];
    modName = parts[1];
  }
  return { modAddr, modName };
}

export function generateFunctionAbiForAI(
  selectedModule: any,
  selectedFunction: any,
  contractAddress?: string
) {
  if (!selectedModule || !selectedFunction) return null;

  const { modAddr, modName } = extractModuleDetails(selectedModule, contractAddress);
  const functionName = selectedFunction.name || "unknown";

  // Vault functions carry their catalogued risk profile: permission, effects, failure modes and — for
  // the two renounce entries — the irreversibility flag. The catalog lives in
  // config/vault.ts, pinned to the Move sources by `npm run check:vault`.
  const vaultDoc =
    /^(vault|publisher|vault_fee)$/.test(modName) && sameAddress(modAddr, DAO_CONTRACTS_VAULT)
      ? getVaultFunctionDocs(modName, functionName)
      : undefined;

  return {
    context: "Supra Blockchain Smart Contract ABI",
    fully_qualified_name: `${modAddr}::${modName}::${functionName}`,
    contract_address: modAddr,
    module_name: modName,
    function_name: functionName,
    execution_kind: selectedFunction.is_entry ? "entry" : selectedFunction.is_view ? "view" : "internal",
    requires_wallet_signature: selectedFunction.is_entry,
    mutates_state: selectedFunction.is_entry === true || Boolean(vaultDoc),
    permission_level: vaultDoc?.permission ?? (selectedFunction.is_entry ? "user-write" : "public-read"),
    risk_level: vaultDoc?.risk ?? (selectedFunction.is_entry ? "unknown" : "none"),
    ...(vaultDoc?.irreversible ? { irreversible: true } : {}),
    type_arguments:
      selectedFunction.generic_type_params?.map((_: any, index: number) => ({
        index,
        hint: "Generic Type (e.g., 0x1::supra_coin::SupraCoin)",
      })) || [],
    arguments: (selectedFunction.params || [])
      .filter((p: string) => p !== "&signer")
      .map((type: string, index: number) => ({
        index,
        type,
        example_value_format: type?.includes("0x1::string::String")
          ? "0x1::supra_coin::SupraCoin"
          : type === "bool"
          ? "true/false"
          : "any valid Move type representation",
      })),
    effects: vaultDoc?.effects ?? [],
    common_failures: vaultDoc?.common_failures ?? [],
  };
}
