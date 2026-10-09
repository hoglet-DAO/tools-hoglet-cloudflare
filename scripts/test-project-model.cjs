/**
 * Checks the project model against the real compile service.
 *
 * The important assertion is the generated Move.toml: a package whose named address does not match the
 * account it is published to compiles cleanly and then fails on-chain, so the template is verified by
 * actually compiling a project through it rather than by reading the string.
 *
 * Run: node scripts/test-project-model.cjs
 */

const fs = require("fs");
const path = require("path");
const { loadTs } = require("./load-module.cjs");

const proj = loadTs(path.join(__dirname, "..", "lib", "move", "project.ts"));
const svc = loadTs(path.join(__dirname, "..", "lib", "move", "compileService.ts"));

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

let failed = 0;
const check = (n, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + d}`);
  if (!c) failed++;
};

console.log("buildMoveToml:");
const ADDR = "0xc4178a780e9e6324763c11eb9cd4fe1733d2f6099cb9580ae440f5c3d6d9b3b7";
const toml = proj.buildMoveToml("my_token", ADDR);
check("names the package", /name = "my_token"/.test(toml));
check("binds the named address to the target", toml.includes(`my_token = "${ADDR}"`), toml);
check("pins the framework rev", toml.includes('rev = "dev"'));
check("subdir points at supra-framework", toml.includes("aptos-move/framework/supra-framework"), toml);

console.log();
console.log("validation:");
check("rejects traversal path", proj.isValidModulePath("sources/../x.move") === false);
check("rejects non-sources path", proj.isValidModulePath("other/x.move") === false);
check("rejects non-move ext", proj.isValidModulePath("sources/x.txt") === false);
check("accepts sources/Pool.move", proj.isValidModulePath("sources/Pool.move") === true);
check("rejects bad package name", proj.isValidPackageName("1bad") === false);
check("accepts good package name", proj.isValidPackageName("my_token") === true);
check("modulePathFor adds prefix", proj.modulePathFor("Pool") === "sources/Pool.move");

console.log();
console.log("projectToFiles drops unsafe paths:");
const files = proj.projectToFiles({
  name: "my_token",
  address: ADDR,
  modules: [
    { path: "sources/Good.move", source: "module my_token::good {}" },
    { path: "sources/../../evil.move", source: "nope" },
  ],
  updatedAt: 0,
});
check("keeps the safe module", "sources/Good.move" in files);
check("drops the traversal attempt", !Object.keys(files).some((k) => k.includes("evil")), Object.keys(files).join(","));
check("includes Move.toml", "Move.toml" in files);

(async () => {
  console.log();
  console.log("compile the starter project for real:");
  const starter = {
    name: "my_token",
    address: ADDR,
    modules: [proj.starterModule("my_token")],
    updatedAt: 0,
  };
  const payload = proj.projectToFiles(starter);
  console.log("   files:", Object.keys(payload).join(", "));

  const res = await svc.compileMove(payload, env.MOVE_COMPILE_TOKEN, { attempts: 3 });
  if (!res.ok) {
    console.log("   FAILED:", res.error);
    console.log("   ", (res.stdout + res.stderr).slice(-800));
    process.exit(1);
  }
  console.log(`   ok=true ms=${res.ms} modules=${JSON.stringify(res.modules)}`);
  check("module id is 0x-prefixed", res.modules[0].startsWith("0x"), res.modules[0]);
  // ModuleID is <address>::<module name>. The address segment is what proves the named address in the
  // generated Move.toml bound to the deployment target — if it did not, the id would carry the
  // placeholder address from Move.toml instead.
  check(
    "module id carries the target address",
    res.modules[0].startsWith(`0x${ADDR.slice(2).toLowerCase()}`),
    res.modules[0]
  );

  console.log();
  console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})();