/**
 * Compiles and tests the real vault package through the hosted Move service.
 *
 * There is no local Supra toolchain or Docker here, so without this the contract's sources and its test
 * suite are never actually built — which is how a stale module name survived a rename unnoticed.
 *
 * Run: node scripts/verify-vault-build.cjs
 */

const fs = require("fs");
const path = require("path");
const { loadTs } = require("./load-module.cjs");

const ROOT = path.join(__dirname, "..");
const PKG_DIR = path.join(ROOT, "smart_contract", "dao_contracts_vault");

const svc = loadTs(path.join(ROOT, "lib", "move", "compileService.ts"));
const diag = loadTs(path.join(ROOT, "lib", "move", "diagnostics.ts"));

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

/** Reads the package, optionally including `tests/` (the compile endpoint does not need them). */
function readPackage(withTests) {
  const files = { "Move.toml": fs.readFileSync(path.join(PKG_DIR, "Move.toml"), "utf8") };
  for (const dir of withTests ? ["sources", "tests"] : ["sources"]) {
    const abs = path.join(PKG_DIR, dir);
    for (const name of fs.readdirSync(abs)) {
      files[`${dir}/${name}`] = fs.readFileSync(path.join(abs, name), "utf8");
    }
  }
  return files;
}

let failed = 0;
const check = (n, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + d}`);
  if (!c) failed++;
};

(async () => {
  const sources = readPackage(false);
  console.log("compiling", Object.keys(sources).join(", "));

  const compiled = await svc.compileMove(sources, env.MOVE_COMPILE_TOKEN, { attempts: 3 });
  if (!compiled.ok) {
    console.log("\nCOMPILE FAILED\n");
    console.log(svc ? (compiled.stdout || "") + (compiled.stderr || "") : "");
    console.log("error:", compiled.error);
    process.exit(1);
  }
  console.log(`  compiled in ${compiled.ms} ms, modules: ${JSON.stringify(compiled.modules)}`);
  check("the package compiles", true);
  check("it exposes vault", compiled.modules.some((m) => m.endsWith("::vault")), JSON.stringify(compiled.modules));
  check("it exposes publisher", compiled.modules.some((m) => m.endsWith("::publisher")), JSON.stringify(compiled.modules));

  console.log();
  console.log("running the test suite:");
  const files = readPackage(true);
  const tested = await svc.runMoveTests(files, env.MOVE_COMPILE_TOKEN, { attempts: 1 });
  const summary = diag.summarizeTests(tested.stdout || "");
  if (!tested.ok || !summary.ran) {
    console.log("\nTEST RUN FAILED\n");
    console.log(diag.stripAnsi((tested.stdout || "") + (tested.stderr || "")));
    console.log("error:", tested.error);
    process.exit(1);
  }
  console.log(`  ${summary.total} tests, ${summary.passed} passed, ${summary.failed} failed`);
  check("the whole suite passes", summary.ok === true, JSON.stringify(summary));
  check("it actually ran the contract tests", summary.total > 20, `only ${summary.total} tests ran`);

  console.log();
  console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})();