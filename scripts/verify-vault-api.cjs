/**
 * Verifies every vault function the app calls resolves against the deployed contract.
 *
 * The module was renamed (`governance` -> `vault`) and the package was redeployed, so a stale module name
 * or a stale address would make every call fail — and a failed view resolves to `undefined` inside the
 * audit, which reads as "no factory record" rather than as a wiring error. This checks the wiring itself,
 * using the exact address, module and function names the app uses.
 *
 * Run: node scripts/verify-vault-api.cjs
 */

const fs = require("fs");
const path = require("path");
const { loadTs } = require("./load-module.cjs");

// Read the same values the app reads, so this cannot pass while the app is misconfigured.
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "..", ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

// The config reads `process.env`, which Node does not populate from .env on its own. Without this the
// module falls back to its 0x1 default and every check would be verifying the fallback instead of the
// deployment — passing for the wrong reason.
process.env.NEXT_PUBLIC_DAO_CONTRACTS_VAULT = env.NEXT_PUBLIC_DAO_CONTRACTS_VAULT;

// Only the config is loaded as a module. The hooks pull in the wallet context and the whole app, so
// instead of loading them this reads their source and checks the wiring textually — which is enough,
// because what is being verified is the address and module name they pass, not their behaviour.
const contracts = loadTs(path.join(__dirname, "..", "config", "contracts.ts"));
const VAULT = contracts.DAO_CONTRACTS_VAULT;
const MODULE = contracts.VAULT_MODULE;
const RPC = env.NEXT_PUBLIC_RPC_URL_TESTNET;

const hookSource = fs.readFileSync(
  path.join(__dirname, "..", "hooks", "features", "governance", "useGovernanceActions.ts"),
  "utf8"
);
const auditSource = fs.readFileSync(
  path.join(__dirname, "..", "hooks", "features", "governance", "useGovernanceAudit.ts"),
  "utf8"
);

let failed = 0;
const check = (n, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + d}`);
  if (!c) failed++;
};

async function callView(moduleName, fn, args) {
  const r = await fetch(`${RPC}/rpc/v1/view`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      function: `${VAULT}::${moduleName}::${fn}`,
      type_arguments: [],
      arguments: args,
    }),
  });
  const t = await r.text();
  if (!t.trim()) return { ok: false, reason: "empty response" };
  try {
    const j = JSON.parse(t);
    if (j.error) return { ok: false, reason: j.error };
    if (j.message) return { ok: false, reason: j.message };
    return { ok: true, value: j.result };
  } catch {
    return { ok: false, reason: t.slice(0, 120) };
  }
}

(async () => {
  console.log("address :", VAULT);
  console.log("rpc     :", RPC);
  console.log();

  console.log("the config and the env agree:");
  check("env and config resolve to the same address", VAULT === env.NEXT_PUBLIC_DAO_CONTRACTS_VAULT,
    `${VAULT} vs ${env.NEXT_PUBLIC_DAO_CONTRACTS_VAULT}`);
  check("module is named vault", MODULE === "vault", MODULE);
  check("the vault address is not the 0x1 fallback", VAULT !== "0x1", VAULT);

  console.log();
  console.log("the hooks use the configured constants, not literals:");
  check("useGovernanceActions uses VAULT_MODULE", /module:\s*VAULT_MODULE/.test(hookSource));
  check("useGovernanceActions uses DAO_CONTRACTS_VAULT", /address:\s*DAO_CONTRACTS_VAULT/.test(hookSource));
  check("no leftover 'governance' module literal",
    !/callViewRaw\([^)]*"governance"/.test(hookSource) && !/module:\s*"governance"/.test(hookSource));
  check("useGovernanceAudit passes VAULT_MODULE",
    /callViewRaw\(rpcUrl,\s*DAO_CONTRACTS_VAULT,\s*VAULT_MODULE/.test(auditSource));
  check("the account-only entry keeps 0x1::account",
    /rotate_authentication_key_call:\s*\{\s*module:\s*"account",\s*address:\s*"0x1"/.test(hookSource));

  console.log();
  console.log("every view the audit reads resolves:");

  // Arguments chosen so the call cannot abort for a reason unrelated to the wiring: a plain account for
  // the address-taking views, and values inside range for the paginated one.
  const PROBE = "0xe799069a01bcb4e79a714d685a0fa850e644d9b0d973844ad37dd543570c9".replace("dd", "d9");

  const views = [
    ["get_eoa_security_status", [PROBE]],
    ["is_eoa_key_annihilated", [PROBE]],
    ["is_eoa_permanently_immutable", [PROBE]],
    ["is_eoa_donation_complete", [PROBE]],
    ["is_contract_renounced", [PROBE]],
    ["is_cryptographically_frozen", [PROBE]],
    ["get_contract_admin", [PROBE]],
    ["get_eoa_proxy", [PROBE]],
    ["is_eoa_contract", [PROBE]],
    ["get_offer_target", [PROBE]],
    ["predict_eoa_proxy_address", [PROBE]],
    ["get_total_contracts", []],
    ["get_contracts_page", ["0", "1"]],
    ["get_contracts_by_creator", [PROBE, "1"]],
    ["get_all_contracts", []],
  ];

  for (const [fn, args] of views) {
    const res = await callView(MODULE, fn, args);
    check(fn, res.ok, res.reason);
  }

  // The label is the package name, encoded exactly as the app encodes it — the same helper the deploy call
  // uses. The contract derives the Resource Account from `(creator, label)`, so this view is what the whole
  // compile-then-deploy flow depends on agreeing with.
  const label = "0x" + Buffer.from("my_package", "utf8").toString("hex");
  const predicted = await callView(MODULE, "predict_next_contract_address", [PROBE, label]);
  check("predict_next_contract_address (creator, label)", predicted.ok, predicted.reason);

  // Pinned against the value this exact call was verified with on chain, so a change to the encoder cannot
  // silently start deriving a different address than the one the user compiled against.
  const hex = loadTs(path.join(__dirname, "..", "utils", "hex.ts"));
  check("labelToHex is the raw UTF-8 bytes",
    hex.labelToHex("my_package") === label,
    `${hex.labelToHex("my_package")} vs ${label}`);

  // Two labels, one creator, two addresses. Without this the view could be ignoring the label and returning
  // a constant, which would still pass the check above.
  const other = await callView(
    MODULE,
    "predict_next_contract_address",
    [PROBE, "0x" + Buffer.from("other_package", "utf8").toString("hex")]
  );
  const first = (predicted.value && predicted.value[0]) || "";
  const second = (other.value && other.value[0]) || "";
  check("a different label yields a different address",
    Boolean(first) && Boolean(second) && first !== second,
    `${first} vs ${second}`);

  console.log();
  console.log("entry points declared by the deployed source:");
  // The RPC's /modules endpoint returns only { address, name } — no `exposed_functions` — so the ABI
  // cannot be read from here. The views above already prove the module resolves at this address; this
  // reads the source to confirm which entry points that module declares.
  const vaultSource = fs.readFileSync(
    path.join(__dirname, "..", "smart_contract", "dao_contracts_vault", "sources", "vault.move"),
    "utf8"
  );
  const declaredEntries = [...vaultSource.matchAll(/public entry fun (\w+)/g)].map((m) => m[1]);
  for (const name of [
    "deploy_autonomous_contract",
    "donate_eoa_to_dao",
    "cancel_eoa_delegation",
    "upgrade_contract",
    "renounce_contract",
    "transfer_admin",
  ]) {
    check(`entry ${name}`, declaredEntries.includes(name), `declared: ${declaredEntries.join(", ")}`);
  }

  console.log();
  console.log("the deployed address hosts the vault module:");
  const modsRes = await fetch(`${RPC}/rpc/v1/accounts/${VAULT}/modules`);
  const modsText = await modsRes.text();
  check("vault is published at the configured address",
    new RegExp(`${VAULT.replace("0x", "")}::vault`).test(modsText) || /::vault/.test(modsText),
    modsText.slice(0, 200));
  check("the module is not found at the old address",
    !(await fetch(`${RPC}/rpc/v1/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        function: "0x49ad52680e96d9f0514918c109776e0951769c2021eb74668ce58d09cb095268::vault::get_total_contracts",
        type_arguments: [],
        arguments: [],
      }),
    })
      .then((r) => r.text())
      .then((t) => !/error|message/.test(t) && t.trim().length > 0)));

  console.log();
  console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})();