/**
 * Verifies the multi-module and rename fixes against the real compile service.
 *
 * Two bugs this pins down:
 *   - adding a second file used to emit `module <pkg>::example` again, so a two-file package could never
 *     build. `newModuleSource` now derives the module name from the file name.
 *   - the toolchain does not require the file name to match the module name (it compiled
 *     `sources/Renamed.move` declaring `pkg::gamma`), so `renameModuleDeclaration` is what keeps the
 *     visible name honest. This checks the renamed pair actually compiles.
 *
 * Run: node scripts/test-rename.cjs
 */

const fs = require("fs");
const path = require("path");
const { loadTs } = require("./load-module.cjs");

const proj = loadTs(path.join(__dirname, "..", "lib", "move", "project.ts"));
const svc = loadTs(path.join(__dirname, "..", "lib", "move", "compileService.ts"));

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

const PKG = "rn";
const TOML = proj.buildMoveToml(PKG, "0xc4178a780e9e6324763c11eb9cd4fe1733d2f6099cb9580ae440f5c3d6d9b3b7");

let failed = 0;
const check = (n, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + d}`);
  if (!c) failed++;
};

/** Renders whatever a failure actually carries. Transport failures have no compiler output at all. */
function showOutput(res) {
  const parts = [res.error, res.stdout, res.stderr].filter((x) => typeof x === "string" && x.length);
  return parts.join("\n").replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").slice(-1200) || "(no output)";
}

console.log("moduleNameFromPath:");
check("strips .move", proj.moduleNameFromPath("sources/Pool.move") === "Pool");
check("uppercases first letter", proj.moduleNameFromPath("sources/pool.move") === "Pool");
check("sanitises invalid chars", proj.moduleNameFromPath("sources/my-pool.v2.move") === "Mypoolv2");
check("never starts with a digit", /^[^0-9]/.test(proj.moduleNameFromPath("sources/1pool.move")));

console.log();
console.log("newModuleSource produces distinct names:");
const s1 = proj.newModuleSource(PKG, proj.moduleNameFromPath("sources/alpha.move"));
const s2 = proj.newModuleSource(PKG, proj.moduleNameFromPath("sources/beta.move"));
check("alpha", s1.includes(`module ${PKG}::Alpha`), s1);
check("beta", s2.includes(`module ${PKG}::Beta`), s2);
check("names differ", s1 !== s2);

console.log();
console.log("renameModuleDeclaration:");
const renamed = proj.renameModuleDeclaration(s1, "Renamed");
check("moves the declaration", renamed.includes(`module ${PKG}::Renamed`), renamed.split("\n")[0]);
// Lengths differ only because "Alpha" -> "Renamed" is longer; what must not change is everything
// after the declaration.
check(
  "body untouched",
  renamed.slice(renamed.indexOf("{")) === s1.slice(s1.indexOf("{")),
  `${renamed.slice(renamed.indexOf("{"))} vs ${s1.slice(s1.indexOf("{"))}`
);
check("ignores a non-module file", proj.renameModuleDeclaration("// just a comment", "X") === "// just a comment");

(async () => {
  // The function goes INSIDE the generated brace pair. `newModuleSource` ends with a newline, so the
  // declaration was being appended after a closing brace, which is a parse error rather than a test bug.
  const withBody = (src, body) => src.replace(/\n\}\s*$/, `\n    ${body}\n}\n`);

  console.log();
  console.log("compile the two-module package (the case that used to fail):");
  const res = await svc.compileMove(
    {
      "Move.toml": TOML,
      "sources/alpha.move": withBody(s1, "public fun v(): u64 { 1 }"),
      "sources/beta.move": withBody(s2, "public fun v(): u64 { 2 }"),
    },
    env.MOVE_COMPILE_TOKEN,
    { attempts: 1 }
  );
  console.log(`   ok=${res.ok} modules=${JSON.stringify(res.modules || [])}`);
  if (!res.ok) {
    // `stdout`/`stderr` only exist on failures that came from the compiler, so joining them unguarded
    // crashed the reporter and hid the reason the test was failing.
    console.log(showOutput(res));
  }
  check("two-module package compiles", res.ok === true);
  check("both module ids returned", (res.modules || []).length === 2, JSON.stringify(res.modules));

  console.log();
  console.log("compile the renamed pair (file name and declaration together):");
  const r2 = await svc.compileMove(
    { "Move.toml": TOML, "sources/Renamed.move": withBody(renamed, "public fun v(): u64 { 9 }") },
    env.MOVE_COMPILE_TOKEN,
    { attempts: 1 }
  );
  console.log(`   ok=${r2.ok} modules=${JSON.stringify(r2.modules || [])}`);
  if (!r2.ok) {
    console.log(showOutput(r2));
  }
  check("renamed module compiles", r2.ok === true);
  check(
    "module id follows the new name",
    (r2.modules && r2.modules[0] || "").endsWith("::Renamed"),
    JSON.stringify(r2.modules)
  );

  console.log();
  console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})();