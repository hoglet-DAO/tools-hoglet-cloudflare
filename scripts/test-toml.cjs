/**
 * Checks the Move.toml parser/validator and the editable-manifest path.
 *
 * The validator is the only thing standing between an edited manifest and a failed on-chain publish, so
 * it is tested against the cases that matter: a correct manifest, one pointing at the wrong address, one
 * that keeps the framework block but changes the address, and one carrying an extra git dependency — the
 * reason the manifest became editable in the first place.
 *
 * Run: node scripts/test-toml.cjs
 */

const fs = require("fs");
const path = require("path");
const { loadTs } = require("./load-module.cjs");

const proj = loadTs(path.join(__dirname, "..", "lib", "move", "project.ts"));

const ADDR = "0xc4178a780e9e6324763c11eb9cd4fe1733d2f6099cb9580ae440f5c3d6d9b3b7";
const OTHER = "0xfd250445eaa195a7063b2a5e3166d932e00f9e47cf570dbccb8fb2d3ee777084";

let failed = 0;
const check = (n, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + d}`);
  if (!c) failed++;
};

console.log("parseToml:");
const good = proj.buildMoveToml("my_package", ADDR);
const p = proj.parseToml(good);
check("reads the package name", p.packageName === "my_package", p.packageName);
check("reads the named address", p.addresses.my_package === ADDR, JSON.stringify(p.addresses));
check("counts the dependency", p.dependencies.length === 1, JSON.stringify(p.dependencies));
check("dependency name is unprefixed", p.dependencies[0].name === "SupraFramework", JSON.stringify(p.dependencies));
check("captures the git url", /aptos-core/.test(p.dependencies[0].git || ""), p.dependencies[0].git);
check("captures the rev", p.dependencies[0].rev === "dev", p.dependencies[0].rev);
check("captures the subdir", (p.dependencies[0].subdir || "").includes("supra-framework"), p.dependencies[0].subdir);

console.log();
console.log("parseToml ignores comments but respects quoted '#':");
const commented = good + "\n# a comment\n";
check("comment line ignored", proj.parseToml(commented).packageName === "my_package");
const withHash = `[package]\nname = "a#b"   # trailing comment\n`;
check("hash inside quotes kept", proj.parseToml(withHash).packageName === "a#b", proj.parseToml(withHash).packageName);

console.log();
console.log("validateToml:");
check("accepts the generated manifest", proj.validateToml(good, ADDR).ok === true,
  JSON.stringify(proj.validateToml(good, ADDR).errors));
check("accepts an uppercase address", proj.validateToml(good, ADDR.toUpperCase().replace("0X", "0x")).ok === true);
check("accepts a manifest with no 0x prefix",
  proj.validateToml(proj.buildMoveToml("my_package", ADDR.slice(2)), ADDR).ok === true);

const wrong = proj.validateToml(proj.buildMoveToml("my_package", OTHER), ADDR);
check("rejects the wrong address", wrong.ok === false);
check("names the expected address", wrong.errors.some((e) => e.includes(ADDR)), JSON.stringify(wrong.errors));

const renamed = good.replace("[addresses]", "[addresses]\nother_pkg = \"0x1111\"");
check("rejects when the package name is unbound",
  proj.validateToml(renamed.replace(/my_package = ".*?"\n/, ""), ADDR).ok === false);

check("rejects a manifest with no package name",
  proj.validateToml("[package]\nversion = \"0.0.1\"\n", ADDR).ok === false);
check("rejects a manifest with no addresses",
  proj.validateToml("[package]\nname = \"x\"\n", ADDR).ok === false);
check("rejects a package name that does not match the workspace",
  proj.validateToml(good, ADDR, ["my_package"], "different_name").ok === false);
check("accepts when the package name matches the workspace",
  proj.validateToml(good, ADDR, ["my_package"], "my_package").ok === true);

console.log();
console.log("parseGitRepo:");
const gitForms = [
  "https://github.com/Entropy-Foundation/aptos-core",
  "https://github.com/Entropy-Foundation/aptos-core.git",
  "git@github.com:Entropy-Foundation/aptos-core.git",
  "github.com/Entropy-Foundation/aptos-core",
];
check("parses every URL form",
  gitForms.every((u) => {
    const p = proj.parseGitRepo(u);
    return p && p.org === "Entropy-Foundation" && p.repo === "aptos-core";
  }),
  gitForms.map((u) => JSON.stringify(proj.parseGitRepo(u))).join(" | "));
check("rejects a non-git string", proj.parseGitRepo("not a url") === null);

console.log();
console.log("the allowlist is NOT mirrored here (the service is authoritative):");
check("no ALLOWED_ORGS constant exists", proj.ALLOWED_ORGS === undefined);
check("no isAllowedOrg helper exists", proj.isAllowedOrg === undefined);
check("parseGitRepo still names the org", proj.parseGitRepo("https://github.com/aptos-labs/x")?.org === "aptos-labs");

console.log();
console.log("dependency problems are warnings, never errors:");
// The organisation is deliberately not judged. The service owns the allowlist and answers a fast
// `400 git dependency not allowed` before compiling, and a mirrored copy here warned about the approved
// ones — `Entropy-Foundation` and `hoglet-DAO` both are — which is a false alarm on a valid manifest.
const otherOrg = good + `\n[dependencies.AptosStdlib]\ngit = "https://github.com/aptos-labs/aptos-core"\nrev = "dev"\n`;
const oo = proj.validateToml(otherOrg, ADDR);
check("a dep from any org stays valid", oo.ok === true, JSON.stringify(oo.errors));
check("...and the org is not second-guessed",
  !oo.warnings.some((w) => w.includes("aptos-labs")), JSON.stringify(oo.warnings));

const mutableRev = good + `\n[dependencies.Other]\ngit = "https://github.com/example/thing"\nrev = "master"\n`;
const mv = proj.validateToml(mutableRev, ADDR);
check("a mutable rev is a warning", mv.ok === true && mv.warnings.some((w) => w.includes("master")),
  `ok=${mv.ok} warnings=${JSON.stringify(mv.warnings)}`);

// `main` is where the team's own dependencies live, so it is accepted without a warning.
const mainRev = good + `\n[dependencies.Other]\ngit = "https://github.com/example/thing"\nrev = "main"\n`;
const mrv = proj.validateToml(mainRev, ADDR);
check("main is accepted without a warning", mrv.ok === true && mrv.warnings.length === 0,
  `ok=${mrv.ok} warnings=${JSON.stringify(mrv.warnings)}`);

const noRev = good + `\n[dependencies.Other]\ngit = "https://github.com/example/thing"\n`;
const nr = proj.validateToml(noRev, ADDR);
check("a dep without a rev is a warning", nr.ok === true && nr.warnings.some((w) => w.includes("no rev")),
  `ok=${nr.ok} warnings=${JSON.stringify(nr.warnings)}`);

// The exact case that was false-alarmed: an approved org, on a pinned rev, subdir and all.
const allowedDep = good + `\n[dependencies.MoveStdlib]\ngit = "https://github.com/Entropy-Foundation/aptos-core"\nrev = "dev"\nsubdir = "aptos-move/framework/move-stdlib"\n`;
const ad = proj.validateToml(allowedDep, ADDR);
check("an approved dep on a pinned rev raises nothing",
  ad.ok === true && ad.warnings.length === 0, JSON.stringify(ad.warnings));
check("both deps parsed", ad.parsed.dependencies.length === 2, JSON.stringify(ad.parsed.dependencies));

console.log();
console.log("the framework itself:");
const fork = good.replace("Entropy-Foundation/aptos-core", "someone-else/aptos-core");
const fv = proj.validateToml(fork, ADDR);
check("a framework fork is a warning", fv.ok === true && fv.warnings.some((w) => w.includes("fork")),
  `ok=${fv.ok} warnings=${JSON.stringify(fv.warnings)}`);

const wrongRev = good.replace('rev = "dev"', 'rev = "v1.2.3"');
const wr = proj.validateToml(wrongRev, ADDR);
check("an uncached framework rev is a warning", wr.ok === true && wr.warnings.some((w) => w.includes("cached")),
  `ok=${wr.ok} warnings=${JSON.stringify(wr.warnings)}`);
check("the generated manifest is error-free and warning-free",
  proj.validateToml(good, ADDR).errors.length === 0 && proj.validateToml(good, ADDR).warnings.length === 0);

console.log();
console.log("the check follows the names the MODULES use, not [package] name:");
// A legal rename: the package was renamed but the address key kept its old spelling. The modules are what
// the toolchain compiles under, so this must be accepted — reporting it was the false positive.
const renamedPackage = `[package]\nname = "my_token"\nversion = "0.0.1"\n\n[addresses]\nmy_package = "${ADDR}"\n\n[dependencies.SupraFramework]\ngit = "${proj.FRAMEWORK_GIT}"\nrev = "${proj.FRAMEWORK_REV}"\nsubdir = "${proj.FRAMEWORK_SUBDIR}"\n`;
const rp = proj.validateToml(renamedPackage, ADDR, ["my_package"]);
check("accepted when the module's name is bound to the target", rp.ok === true, JSON.stringify(rp.errors));

const rpWrong = proj.validateToml(renamedPackage, ADDR, ["my_token"]);
check("rejected when the module's name is not bound", rpWrong.ok === false, JSON.stringify(rpWrong.errors));
check("the error names the missing binding", rpWrong.errors.some((e) => e.includes("my_token")),
  JSON.stringify(rpWrong.errors));

const wrongAddr = proj.validateToml(good, OTHER, ["my_package"]);
check("rejected when the bound address differs from the target", wrongAddr.ok === false,
  JSON.stringify(wrongAddr.errors));
check("the mismatch names the expected address", wrongAddr.errors.some((e) => e.includes(OTHER)),
  JSON.stringify(wrongAddr.errors));

check("falls back to [package] name with no sources supplied", proj.validateToml(good, ADDR).ok === true);
check("the fallback still catches a wrong address", proj.validateToml(good, OTHER).ok === false);

console.log();
console.log("addressNamesUsedByModules:");
check("reads a declaration",
  JSON.stringify(proj.addressNamesUsedByModules(["module my_pkg::Pool { }"])) === '["my_pkg"]',
  JSON.stringify(proj.addressNamesUsedByModules(["module my_pkg::Pool { }"])));
check("collects several, deduplicated",
  JSON.stringify(proj.addressNamesUsedByModules(["module a::X {}", "module b::Y {}", "module a::Z {}"]).sort()) ===
    '["a","b"]',
  JSON.stringify(proj.addressNamesUsedByModules(["module a::X {}", "module b::Y {}", "module a::Z {}"])));
check("ignores a literal address module",
  proj.addressNamesUsedByModules(["module 0x1::foo {}"]).length === 0,
  JSON.stringify(proj.addressNamesUsedByModules(["module 0x1::foo {}"])));
check("ignores an address literal with a name suffix",
  proj.addressNamesUsedByModules(["module 0xCAFE::bar {}"]).length === 0,
  JSON.stringify(proj.addressNamesUsedByModules(["module 0xCAFE::bar {}"])));
check("ignores a mention inside a comment",
  proj.addressNamesUsedByModules(["// module fake::x {}\nmodule real::y {}"]).join() === "real",
  JSON.stringify(proj.addressNamesUsedByModules(["// module fake::x {}\nmodule real::y {}"])));

console.log();
console.log("renamePackageInSource:");
const src = "module my_pkg::Pool {\n    use my_pkg::other;\n}\n";
const renamedSrc = proj.renamePackageInSource(src, "my_pkg", "new_pkg");
check("rewrites the declaration", renamedSrc.includes("module new_pkg::Pool"), renamedSrc);
check("rewrites the self-import", renamedSrc.includes("use new_pkg::other"), renamedSrc);
check("no occurrence of the old name is left", !renamedSrc.includes("my_pkg::"), renamedSrc);
check("a longer name containing the old one is untouched",
  proj.renamePackageInSource("module not_my_pkg::x {}", "my_pkg", "z").includes("not_my_pkg::"),
  proj.renamePackageInSource("module not_my_pkg::x {}", "my_pkg", "z"));
check("a no-op rename changes nothing", proj.renamePackageInSource(src, "my_pkg", "my_pkg") === src);

console.log();
console.log("renamePackageInToml:");
const toml = proj.buildMoveToml("my_package", ADDR);
const renamedToml = proj.renamePackageInToml(toml, "my_package", "my_token");
const reparsed = proj.parseToml(renamedToml);
check("renames [package] name", reparsed.packageName === "my_token", reparsed.packageName);
check("renames the [addresses] key", reparsed.addresses.my_token === ADDR, JSON.stringify(reparsed.addresses));
check("drops the old address key", reparsed.addresses.my_package === undefined, JSON.stringify(reparsed.addresses));
check("leaves the dependency block alone", renamedToml.includes("[dependencies.SupraFramework]"), renamedToml);
check("the renamed manifest validates against the same address",
  proj.validateToml(renamedToml, ADDR, ["my_token"]).ok === true,
  JSON.stringify(proj.validateToml(renamedToml, ADDR, ["my_token"]).errors));

console.log();
console.log("a missing framework is still an error:");
const noFw = `[package]\nname = "my_package"\n\n[addresses]\nmy_package = "${ADDR}"\n`;
const nf = proj.validateToml(noFw, ADDR);
check("errors without SupraFramework", nf.ok === false, JSON.stringify(nf.errors));
check("the error names the missing table", nf.errors.some((e) => e.includes("SupraFramework")), JSON.stringify(nf.errors));

console.log();
console.log("projectToFiles prefers the override:");
const files = proj.projectToFiles({
  name: "my_package",
  address: ADDR,
  modules: [{ path: "sources/A.move", source: "x" }],
  tomlOverride: allowedDep,
  updatedAt: 0,
});
check("override is used", files["Move.toml"] === allowedDep);
check("without override the generated one is used",
  proj.projectToFiles({ name: "my_package", address: ADDR, modules: [], updatedAt: 0 })["Move.toml"] === good);

console.log();
console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);