export interface ScriptFile {
  path: string;
  content: string;
}

export interface ScriptProject {
  id: string;
  name: string;
  updatedAt: number;
  files: ScriptFile[];
  tomlOverride: string | null;
}

export const STARTER_SCRIPT_PATH = "scripts/main.move";

export interface ScriptTemplate {
  name: string;
  tag: string;
  description: string;
  source: string;
}

export const STARTER_SCRIPTS: Record<string, ScriptTemplate> = {
  basic: {
    name: "Caller Check",
    tag: "Minimal Starter",
    description: "Inspect caller &signer and read address with zero extra parameters.",
    source: `script {
    use std::signer;

    fun main(caller: &signer) {
        let _caller_addr = signer::address_of(caller);
    }
}
`,
  },
  multiTransfer: {
    name: "Batch Coin Transfer",
    tag: "DeFi / Payments",
    description: "Transfer native SUPRA coins to multiple recipients in a single atomic transaction.",
    source: `script {
    use std::signer;
    use supra_framework::coin;
    use supra_framework::supra_coin::SupraCoin;

    fun main(caller: &signer, recipient_1: address, amount_1: u64, recipient_2: address, amount_2: u64) {
        let _ = signer::address_of(caller);
        // Transfer to first recipient
        if (amount_1 > 0) {
            coin::transfer<SupraCoin>(caller, recipient_1, amount_1);
        };
        // Transfer to second recipient
        if (amount_2 > 0) {
            coin::transfer<SupraCoin>(caller, recipient_2, amount_2);
        };
    }
}
`,
  },
  airdropCheck: {
    name: "Conditional Gatekeeper",
    tag: "Validation & Safety",
    description: "Assert caller authorization and parameter thresholds atomically before executing.",
    source: `script {
    use std::signer;

    fun main(caller: &signer, expected_caller: address, min_threshold: u64) {
        let caller_addr = signer::address_of(caller);
        assert!(caller_addr == expected_caller, 1001);
        assert!(min_threshold > 0, 1002);
    }
}
`,
  },
};

export function generateScriptToml(packageName: string = "move_script"): string {
  return `[package]
name = "${packageName}"
version = "0.0.1"

[addresses]

[dependencies.SupraFramework]
git = "https://github.com/Entropy-Foundation/aptos-core.git"
rev = "dev"
subdir = "aptos-move/framework/supra-framework"
`;
}

export const DEFAULT_SCRIPT_TOML = generateScriptToml("move_script");
