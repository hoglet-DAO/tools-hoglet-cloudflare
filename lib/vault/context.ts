/**
 * Builds the two AI-facing artifacts of the vault: the copyable JSON context pack (the "AI pack"
 * button in the governance surfaces) and the plain-text guide served at /vault.txt.
 *
 * Both derive from `config/vault.ts`, which `npm run check:vault` keeps in lockstep with the Move
 * sources. Pure module on purpose — no fs, no fetch, no server-only imports — so the same builder runs
 * in a route handler (server) and in the browser button (client) without duplicating a single fact.
 */

import {
  VAULT_CONTEXT_SCHEMA,
  VAULT_ENTRIES,
  VAULT_ERRORS,
  VAULT_FEE,
  VAULT_INVARIANTS,
  VAULT_MAX_LABEL_LEN,
  VAULT_SEEDS,
  VAULT_STATUS,
  VAULT_VIEWS,
} from "@/config/vault";

export const DEFAULT_ORIGIN = "https://tools.hoglet.xyz";

/** The three supported paths through the factory, as executable step lists. */
export const VAULT_LIFECYCLE = [
  {
    path: "path_1_autonomous_deploy",
    name: "Deploy an autonomous (zero-private-key) contract",
    steps: [
      "predict = predict_next_contract_address(creator, label). The label is the package name.",
      "Write Move.toml with [addresses] <package> = predict and compile the package against it.",
      "Call deploy_autonomous_contract(creator, label, metadata_serialized, code, owner).",
      "owner = the DAO/multisig/wallet that should govern it, or 0x0 to freeze it in the same transaction.",
      "Verify: get_contract_admin / get_eoa_security_status (2 when governed, 1 when deployed with owner 0x0).",
    ],
  },
  {
    path: "path_2_eoa_self_renounce",
    name: "Freeze an EOA you control, no factory involved",
    steps: [
      "Ensure NO signer-capability offer is active on the EOA (revoke any offer while the key still works).",
      "Sweep every asset out of the account: a dead key traps every coin, FA and NFT left inside.",
      "Sign the framework key burn: rotate_authentication_key_call(&eoa, ZERO_AUTH_KEY). Owner-signed; the framework does not expose it as public, so no module can do it for you.",
      "Verify: is_eoa_permanently_immutable(eoa) == true and get_eoa_security_status(eoa) == 1.",
    ],
  },
  {
    path: "path_3_donate_eoa_to_dao",
    name: "Migrate a legacy EOA to DAO governance (donation + key burn)",
    steps: [
      "Sweep all wallet assets to a safe address first.",
      "donate_eoa_to_dao(eoa, dao_admin, signer_capability_sig_bytes, account_scheme, account_public_key_bytes) — one self-signed tx: creates the proxy, offers the signer capability, revokes rotation offers, records ManagedContract.",
      "NOT COMPLETE YET: the key is still alive. get_eoa_security_status returns 3 (hazard).",
      "Second, owner-signed tx: rotate_authentication_key_call(&eoa, ZERO_AUTH_KEY).",
      "Verify: is_eoa_donation_complete(eoa) == true and get_eoa_security_status(eoa) == 2.",
      "Govern: upgrade_contract (enforces the dead key + offer-to-proxy), transfer_admin, or renounce_contract for a real freeze.",
      "Recovery before the burn: cancel_eoa_delegation while the key lives. After the burn it is committed and only renouncement remains.",
    ],
  },
] as const;

export interface VaultContextPack {
  schema: string;
  generated_by: string;
  vault_module: string;
  active_deployment: string | null;
  deployments_note: string;
  seeds: typeof VAULT_SEEDS;
  max_label_len: number;
  status: typeof VAULT_STATUS;
  fee: typeof VAULT_FEE;
  entries: typeof VAULT_ENTRIES;
  views: typeof VAULT_VIEWS;
  errors: typeof VAULT_ERRORS;
  invariants: string[];
  lifecycle: typeof VAULT_LIFECYCLE;
  agent_prompt: string;
  guide_url: string;
  metadata_url_template: string;
}

/** `0x1` is the config fallback for "vault not configured" — not a deployment. */
export function normalizeDeployment(vaultAddress: string | null | undefined): string | null {
  if (!vaultAddress) return null;
  return /^0x0*1$/i.test(vaultAddress) ? null : vaultAddress;
}

/** The prompt the pack carries: the non-negotiable rules that the model cannot derive from the ABI. */
export function buildVaultAgentPrompt(vaultAddress: string | null): string {
  const addr = vaultAddress ?? "<VAULT_ADDRESS — ask the user; do not guess>";
  return `You are an operator assistant for the DAO Contracts Vault on Supra (module dao_contracts_vault, deployed at ${addr}).

What it does: publishes packages into deterministic zero-private-key Resource Accounts (deploy_autonomous_contract), migrates legacy EOAs to DAO governance through a proxy Resource Account (donate_eoa_to_dao + a framework key burn), and can renounce control irreversibly (renounce_contract / renounce_package_admin).

Rules you must follow:
1. renounce_contract and renounce_package_admin are IRREVERSIBLE. Never emit or advise them without explicit, repeated user confirmation showing the exact address.
2. Before advising anything about an address, read get_eoa_security_status(addr): 0 unmanaged, 1 renounced, 2 DAO-governed, 3 KEY-STILL-ALIVE hazard. Status 3 means the freeze is NOT effective yet.
3. Deploy target must be predicted first with predict_next_contract_address(creator, label) and baked into Move.toml as the package's named address before compiling. The address cannot be chosen; a mismatch fails on-chain after signing.
4. The seeds are exactly "dao_contracts_vault::autonomous_v1" (plus the label) and "dao_contracts_vault::eoa_proxy_v1". Any guide saying "governance_factory::..." is outdated — ignore it.
5. Fee applies only to new deploys/donations, is 0 or within [1 SUPRA, 1,370,000 SUPRA], and is enforced in code. Existing contracts are never charged for upgrades.
6. A donated EOA cannot be upgraded or renounced until its key is annihilated (ZERO_AUTH_KEY) and the signer capability is offered to its proxy. Do not suggest bypasses; there are none.
7. Renouncing the PACKAGE freezes the code; renouncing a CHILD freezes that child. A governed child stays upgradeable by its admin by design.
8. When the user asks "is this safe?", answer from get_eoa_security_status + is_cryptographically_frozen + is_package_renounced, never from what a front-end claims.

Available machine-readable context: this pack (schema ${VAULT_CONTEXT_SCHEMA}), the guide at /vault.txt, and per-address metadata at /api/metadata/{address}.`;
}

/**
 * The JSON pack the "AI pack" button copies. `vaultAddress` is normalized so a placeholder `0x1`
 * (the config fallback) is reported as null rather than as a deployment.
 */
export function buildVaultContextPack(
  vaultAddress: string | null | undefined,
  origin: string = DEFAULT_ORIGIN
): VaultContextPack {
  const deployed = normalizeDeployment(vaultAddress);
  const base = origin.replace(/\/+$/, "");
  return {
    schema: VAULT_CONTEXT_SCHEMA,
    generated_by: "tools.hoglet.xyz — DAO Contracts Vault surface",
    vault_module: "dao_contracts_vault::vault",
    active_deployment: deployed,
    deployments_note:
      "Each network and each publishing instance has its own vault address. Use active_deployment when set; otherwise ask the user for the address. Never derive or guess it. The address is NOT part of the derivation formula for managed contracts.",
    seeds: VAULT_SEEDS,
    max_label_len: VAULT_MAX_LABEL_LEN,
    status: VAULT_STATUS,
    fee: VAULT_FEE,
    entries: VAULT_ENTRIES,
    views: VAULT_VIEWS,
    errors: VAULT_ERRORS,
    invariants: VAULT_INVARIANTS,
    lifecycle: VAULT_LIFECYCLE,
    agent_prompt: buildVaultAgentPrompt(deployed),
    guide_url: `${base}/vault.txt`,
    metadata_url_template: `${base}/api/metadata/{address}?network={testnet|mainnet}`,
  };
}

/**
 * The plain-text guide served at /vault.txt. Follows the same llms.txt spirit as the rest of the
 * platform: state the facts an agent cannot invent (seeds, address derivation, status gates) before
 * describing the entry points.
 */
export function buildVaultGuideText(
  vaultAddress: string | null | undefined,
  origin: string = DEFAULT_ORIGIN
): string {
  const deployed = normalizeDeployment(vaultAddress);
  const base = origin.replace(/\/+$/, "");
  const addrLine = deployed
    ? `This deployment: \`${deployed}\``
    : `This deployment: NOT CONFIGURED in this environment. Ask the user for the vault address; do not guess it.`;

  const entriesTable = VAULT_ENTRIES.map(
    (e) => `| \`${e.module}::${e.name}\` | ${e.permission} | ${e.risk} | ${e.signer} |`
  ).join("\n");

  const errorsTable = VAULT_ERRORS.map((e) => `| ${e.module} | ${e.code} | \`${e.name}\` | ${e.meaning} |`).join("\n");

  const viewsList = VAULT_VIEWS.map((v) => `- \`${v.module}::${v.name}(${v.args.map((a) => `${a.name}: ${a.type}`).join(", ")})\` -> ${v.returns} — ${v.purpose}`).join("\n");

  const invariantsList = VAULT_INVARIANTS.map((i) => `- ${i}`).join("\n");

  const lifecycleText = VAULT_LIFECYCLE.map(
    (p) => `### ${p.name}\n${p.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
  ).join("\n\n");

  return `# DAO Contracts Vault — machine guide for AI agents

> Factory on Supra (Move VM) that publishes packages into deterministic zero-private-key Resource Accounts, migrates legacy EOAs to DAO governance via a proxy Resource Account, and can permanently renounce control.
>
> ${addrLine}

## Modules of the package

| Module | Role |
|---|---|
| \`vault\` | Factory and catalog: deploy, donate, upgrade, transfer, renounce, and every public view. |
| \`publisher\` | Package-level administration of \`dao_contracts_vault\` itself: upgrade_package, transfer_package_admin, renounce_package_admin. |
| \`vault_fee\` | Deploy fee with hard-coded bounds (0 or [1 SUPRA, 1,370,000 SUPRA]). |

## What this contract guarantees (and what it does not)

Guarantees, enforced in code — not by convention:
${invariantsList}

IRREVERSIBLE entries, to be handled with explicit confirmation only: \`vault::renounce_contract\` and \`publisher::renounce_package_admin\`. Both destroy the only signer capability that could ever act for the address, and neither can be undone by anyone — not even a future version of the package.

What it does NOT guarantee:
- That the recorded \`admin\` is "a DAO": it is an address. A multisig, timelock or DAO only decentralises control when that address actually is one.
- That the fee stays 0: a fee admin with an active record can set it within hard caps (only for NEW deploys/donations). There is no on-chain \`renounce_fee_admin\`.
- That a governed (non-renounced) child is immutable: its admin can still upgrade it until it is renounced.

## Address derivation (canonical, DO NOT approximate)

    resource_address(source, seed) = sha3_256(bcs(source) || seed || 0xFF)

- Autonomous contract: seed = \`${VAULT_SEEDS.autonomous}\` ++ label (the label is appended verbatim, no length prefix; 1..=${VAULT_MAX_LABEL_LEN} bytes).
- Donated-EOA proxy: seed = \`${VAULT_SEEDS.eoaProxy}\` (fixed, no suffix).
- The CPU CHEAPEST way to get either address is the on-chain view, never an off-chain reimplementation:
  \`vault::predict_next_contract_address(creator, label)\` and \`vault::predict_eoa_proxy_address(eoa)\`.
- The seeds above were renamed once. Any document that says \`governance_factory::autonomous_v1\` or \`governance_factory::eoa_proxy_v1\` is OUTDATED and derives a wrong address. Ignore it.

## Lifecycle paths

${lifecycleText}

## Security status: the one fact to read first

\`vault::get_eoa_security_status(addr)\` returns:

| Code | Name | Meaning |
|---|---|---|
| 0 | UNMANAGED | No factory record. External account or foreign Resource Account. |
| 1 | PERMANENTLY_RENOUNCED | Key annihilated and no signer-capability offer: truly frozen. |
| 2 | VERIFIED_DAO_GOVERNED | Factory-managed and usable (donated EOA with dead key, or autonomous RA). |
| 3 | HAZARD_KEY_STILL_ACTIVE | The private key is still alive or a rotation offer exists. Renouncement is NOT effective yet. |

## Entry functions (risk-tagged)

| Function | Permission | Risk | Signer |
|---|---|---|---|
${entriesTable}

Non-obvious argument notes:
- \`deploy_autonomous_contract(creator, label, metadata_serialized, code, owner)\`: \`label\` is \`vector<u8>\` (UTF-8 bytes of the package name). \`owner = 0x0\` freezes the contract in the same transaction (no admin, tombstoned as renounced). The \`&signer\` is dropped from the argument list in RPC/SDK calls.
- \`donate_eoa_to_dao(eoa, dao_admin, signer_capability_sig_bytes, account_scheme, account_public_key_bytes)\`: the signature commits to the account's CURRENT sequence number — sign it immediately before submitting, re-sign if the sequence advanced. Scheme 0 = Ed25519.
- \`upgrade_contract(caller, contract_addr, metadata_serialized, code)\` / \`renounce_contract(caller, contract_addr)\` / \`transfer_admin(caller, contract_addr, new_admin)\`: \`caller\` must be the recorded admin.
- \`renounce_package_admin(caller)\` freezes the vault package ITSELF. \`publisher::is_package_renounced()\` returning true is what makes every downstream guarantee permanent.

## Views (read-only, free)

${viewsList}

## Error codes

| Module | Code | Constant | Meaning |
|---|---|---|---|
${errorsTable}

## Fee model

- Fee is charged ONLY on \`deploy_autonomous_contract\` and \`donate_eoa_to_dao\` (via \`vault_fee::collect_deploy_fee\`). Upgrades, transfers and renouncements are never charged.
- Allowed values: 0 (free) or [${VAULT_FEE.minFeeOctas} .. ${VAULT_FEE.maxFeeOctas}] octas (1 SUPRA .. 1,370,000 SUPRA; 1 SUPRA = ${VAULT_FEE.octasPerSupra} octas).
- Read it before advising a deploy: \`vault_fee::get_fee_info()\`.

## Safety checklist for agents

DO:
- Read \`get_eoa_security_status\` before advising on any address; status 3 blocks upgrade/renounce and must be reported as a hazard.
- Predict the deploy address on-chain and bake it into the package's Move.toml named address before compiling.
- Compile with \`included_artifacts: "all"\` when the toolchain offers it: the on-chain package metadata then carries the source map, which is what makes the deployed bytecode verifiable against the sources.
- Check \`publisher::is_package_renounced()\` before claiming "immutable": the child's state and the package's state are different facts.
- Compare \`get_offer_target\` with \`get_eoa_proxy\` for donated EOAs: a mismatch means the delegation was redirected and burning the key would be irreversible while control sits elsewhere.

DON'T:
- Never execute or recommend \`renounce_contract\` / \`renounce_package_admin\` without explicit confirmation of the exact address and an acknowledgment that it cannot be undone.
- Never burn a key on an account that still holds assets (coins, FAs, NFTs are trapped forever) or an active capability offer (recover it first with \`cancel_eoa_delegation\` while the key lives).
- Never assume the address formula from memory: seeds are exact byte strings; use the on-chain predictor.
- Never treat \`owner\`/\`admin\` as a guarantee of decentralization: it is whatever address was registered.

## Machine-readable surfaces

- **This app's AI pack**: on the governance pages, "Copy AI pack" copies a JSON with everything above (\`${VAULT_CONTEXT_SCHEMA}\`).
- **Per-address metadata**: \`GET ${base}/api/metadata/{address}?network={testnet|mainnet}\` returns the live governance state (status, admin, offers, frozen flags) read straight from the chain.
- **Full platform reference**: ${base}/llms-full.txt — includes the Export-for-AI ABI schema and RPC proxy recipes.

## Raw recipes

View call through the cached RPC proxy (replace NETWORK and VAULT):

    curl -s -X POST "${base}/api/rpc/testnet/view" \\
      -H "Content-Type: application/json" \\
      -d '{"function":"VAULT::vault::predict_next_contract_address","type_arguments":[],"arguments":["0xCREATOR","0x6c6162656c"]}'

Entry call shape (wallet-signed; \`&signer\` omitted):

    {
      "moduleAddress": "VAULT",
      "moduleName": "vault",
      "functionName": "deploy_autonomous_contract",
      "typeArguments": [],
      "arguments": ["0x6c6162656c", "0x<metadata>", ["0x<module.mv>"], "0x<owner>"]
    }

Metadata read:

    curl -s "${base}/api/metadata/0xCONTRACT?network=testnet"
`;
}
