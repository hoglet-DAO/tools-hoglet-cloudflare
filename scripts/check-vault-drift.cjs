/**
 * Drift guard for the DAO Contracts Vault.
 *
 * The vault is immutable on-chain, so the only place its facts can rot is *here*: the catalog in
 * config/vault.ts, the /vault.txt guide, the AI pack and the README/WHITEPAPER. A stale seed is not a
 * cosmetic bug — it derives an address the deploy can never land on, and every AI agent fed the wrong
 * guide reproduces the mistake. This script pins all of them to the actual Move sources.
 *
 * Run: npm run check:vault   (or: node scripts/check-vault-drift.cjs)
 */

const fs = require("fs");
const path = require("path");
const { loadTs, makeChecker, report } = require("./load-module.cjs");

const ROOT = path.join(__dirname, "..");
const VAULT_DIR = path.join(ROOT, "smart_contract", "dao_contracts_vault");
const SOURCES = {
  vault: fs.readFileSync(path.join(VAULT_DIR, "sources", "vault.move"), "utf8"),
  publisher: fs.readFileSync(path.join(VAULT_DIR, "sources", "publisher.move"), "utf8"),
  vault_fee: fs.readFileSync(path.join(VAULT_DIR, "sources", "vault_fee.move"), "utf8"),
};
const README = fs.readFileSync(path.join(VAULT_DIR, "README.md"), "utf8");
const WHITEPAPER = fs.readFileSync(path.join(VAULT_DIR, "WHITEPAPER.md"), "utf8");

const {
  VAULT_ENTRIES,
  VAULT_ERRORS,
  VAULT_FEE,
  VAULT_MAX_LABEL_LEN,
  VAULT_SEEDS,
  VAULT_STATUS,
  VAULT_VIEWS,
} = loadTs(path.join(ROOT, "config", "vault.ts"));

const { buildVaultContextPack, buildVaultGuideText } = loadTs(path.join(ROOT, "lib", "vault", "context.ts"));

const { check, state } = makeChecker();

/** `137_000_000_000_000` -> 137000000000000 */
const unUnderscore = (n) => Number(String(n).replace(/_/g, ""));

function moveConst(source, name, type) {
  const m = source.match(new RegExp(`const ${name}: ${type} = ([^;]+);`));
  return m ? m[1].trim() : null;
}

function moveBytesConst(source, name) {
  const m = source.match(new RegExp(`const ${name}: vector<u8> = b"([^"]*)";`));
  return m ? m[1] : null;
}

console.log("seeds match the byte strings compiled into vault.move:");
check(
  "AUTONOMOUS_SEED",
  moveBytesConst(SOURCES.vault, "AUTONOMOUS_SEED") === VAULT_SEEDS.autonomous,
  `Move has ${JSON.stringify(moveBytesConst(SOURCES.vault, "AUTONOMOUS_SEED"))}, config has ${JSON.stringify(VAULT_SEEDS.autonomous)}`
);
check(
  "EOA_PROXY_SEED",
  moveBytesConst(SOURCES.vault, "EOA_PROXY_SEED") === VAULT_SEEDS.eoaProxy,
  `Move has ${JSON.stringify(moveBytesConst(SOURCES.vault, "EOA_PROXY_SEED"))}, config has ${JSON.stringify(VAULT_SEEDS.eoaProxy)}`
);
check(
  "MAX_LABEL_LEN",
  unUnderscore(moveConst(SOURCES.vault, "MAX_LABEL_LEN", "u64")) === VAULT_MAX_LABEL_LEN,
  `Move has ${moveConst(SOURCES.vault, "MAX_LABEL_LEN", "u64")}, config has ${VAULT_MAX_LABEL_LEN}`
);

console.log();
console.log("status codes match the STATUS_* constants:");
const STATUS_CONSTS = {
  0: "STATUS_UNMANAGED",
  1: "STATUS_PERMANENTLY_RENOUNCED",
  2: "STATUS_VERIFIED_DAO_GOVERNED",
  3: "STATUS_HAZARD_KEY_STILL_ACTIVE",
};
for (const [code, name] of Object.entries(STATUS_CONSTS)) {
  const value = unUnderscore(moveConst(SOURCES.vault, name, "u8"));
  // The catalog stores the bare names (UNMANAGED...); the Move constants carry the STATUS_ prefix.
  const bare = name.replace("STATUS_", "");
  check(`${code} = ${name}`, Number(code) === value && VAULT_STATUS[code]?.name === bare, `Move=${value}, catalog=${VAULT_STATUS[code]?.name}`);
}

console.log();
console.log("fee bounds match vault_fee.move:");
check(
  "OCTAS_PER_SUPRA",
  unUnderscore(moveConst(SOURCES.vault_fee, "OCTAS_PER_SUPRA", "u64")) === VAULT_FEE.octasPerSupra,
  "octas-per-SUPRA mismatch"
);
check(
  "MIN_FEE_OCTAS",
  unUnderscore(moveConst(SOURCES.vault_fee, "MIN_FEE_OCTAS", "u64")) === VAULT_FEE.minFeeOctas,
  "minimum fee mismatch"
);
check(
  "MAX_FEE_OCTAS",
  unUnderscore(moveConst(SOURCES.vault_fee, "MAX_FEE_OCTAS", "u64")) === VAULT_FEE.maxFeeOctas,
  "maximum fee mismatch"
);

console.log();
console.log("every catalogued entry exists as a `public entry fun` in its module:");
for (const entry of VAULT_ENTRIES) {
  const ok = SOURCES[entry.module].includes(`public entry fun ${entry.name}(`);
  check(`${entry.module}::${entry.name}`, ok, "not found in the Move source");
}

console.log();
console.log("every catalogued view exists as a `public fun` in its module:");
for (const view of VAULT_VIEWS) {
  const ok = SOURCES[view.module].includes(`public fun ${view.name}(`);
  check(`${view.module}::${view.name}`, ok, "not found in the Move source");
}

console.log();
console.log("every error code matches its Move constant:");
for (const err of VAULT_ERRORS) {
  const value = unUnderscore(moveConst(SOURCES[err.module], err.name, "u64"));
  check(`${err.module}::${err.name}`, value === err.code, `Move has ${value}, catalog has ${err.code}`);
}

console.log();
console.log("the docs no longer teach the old (wrong) identity:");
for (const [label, doc] of [["README.md", README], ["WHITEPAPER.md", WHITEPAPER]]) {
  check(`${label}: no governance_factory seed`, !/governance_factory::(autonomous|eoa_proxy)/.test(doc), "stale seed found");
  check(
    `${label}: no FactoryAdmin-era names`,
    !/\b(FactoryAdmin|renounce_factory_admin|upgrade_factory|transfer_factory_admin|is_factory_renounced|get_factory_admin)\b/.test(doc),
    "stale function/struct names found"
  );
}
check("README names the real seed", README.includes("dao_contracts_vault::autonomous_v1"), "real seed absent");
check("README names the package renounce entry", README.includes("renounce_package_admin"), "not documented");
check("README points to the machine guide", README.includes("/vault.txt"), "no /vault.txt link");
check("WHITEPAPER names the real seed", WHITEPAPER.includes("dao_contracts_vault::autonomous_v1"), "real seed absent");
check(
  "README documents the label requirement",
  README.includes("predict_next_contract_address") && /label/i.test(README),
  "label workflow not documented"
);

console.log();
console.log("the generated guide and pack carry the pinned facts:");
const ADDR = "0x4f0ecd9bf5f4d2247bd8f30161729e9cf606233a88976d0a1ce5a99bd1f6f87e";
const pack = buildVaultContextPack(ADDR);
const text = buildVaultGuideText(ADDR);
check("pack schema is versioned", /^hoglet\.[a-z-]+\.v1$/.test(pack.schema ?? ""), "bad schema id");
check("pack carries the deployment", pack.active_deployment === ADDR, "address not injected");
check("pack carries the correct seeds", pack.seeds.autonomous === VAULT_SEEDS.autonomous, "seed mismatch in pack");
check("pack marks 0x1 as unset", buildVaultContextPack("0x1").active_deployment === null, "0x1 leaked as a deployment");
check(
  "guide carries the deployment",
  text.includes(ADDR),
  "address not injected into the guide"
);
check("guide states the correct seed", text.includes(VAULT_SEEDS.autonomous), "seed absent from guide");
check("guide warns about the outdated seed", /governance_factory::autonomous_v1/.test(text), "no stale-seed warning");
check("guide carries the status gate", text.includes("get_eoa_security_status") && text.includes("HAZARD_KEY_STILL_ACTIVE"), "status gate missing");
check("guide carries the dual-master gate error", text.includes("E_EOA_KEY_NOT_BURNED"), "error missing");
check("guide carries the fee ceiling", text.includes(String(VAULT_FEE.maxFeeOctas)), "fee ceiling missing");
check(
  "guide carries the irreversibility rule",
  /IRREVERSIBLE/.test(text) && /renounce_contract/.test(text) && /renounce_package_admin/.test(text),
  "irreversibility not stated"
);
check(
  "guide lists every module",
  text.includes("`vault`") && text.includes("`publisher`") && text.includes("`vault_fee`"),
  "module map incomplete"
);
check(
  "agent prompt is actionable",
  pack.agent_prompt.includes("IRREVERSIBLE") && pack.agent_prompt.includes("predict_next_contract_address"),
  "prompt missing key rules"
);

console.log();
console.log("metadata surface is wired to the same truth:");
const metadataSrc = fs.readFileSync(path.join(ROOT, "lib", "vault", "metadata.ts"), "utf8");
check("metadata lib pins the schema", metadataSrc.includes('"hoglet.contract-metadata.v1"'), "schema id missing");
check(
  "metadata reads the security status view",
  metadataSrc.includes('"get_eoa_security_status"'),
  "status view not read"
);
check(
  "metadata endpoint exists",
  fs.existsSync(path.join(ROOT, "app", "api", "metadata", "[address]", "route.ts")),
  "route missing"
);

report(state);
