/**
 * Verifies diagnostics are attributed to the right file and the right severity.
 *
 * The reported bug: `block.move` and `supra_governance.move` appeared in the project's file list. Those are
 * framework sources, and the parser reduced every path to its last `sources/` segment, so a file the user
 * does not own became indistinguishable from one they do. On top of that, every diagnostic rendered as a
 * failure even when the compile succeeded and the messages were warnings.
 *
 * The fixtures use the real toolchain output shape, including the cache path the framework compiles from.
 *
 * Run: node scripts/test-diagnostics.cjs
 */

const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const { loadTs } = require("./load-module.cjs");

const { parseDiagnostics, stripAnsi } = loadTs(
  path.join(__dirname, "..", "lib", "move", "diagnostics.ts")
);

let failed = 0;
const check = (n, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + d}`);
  if (!c) failed++;
};

const FRAMEWORK_PREFIX =
  "/root/.move/https___github_com_Entropy-Foundation_aptos-core_git_dev/aptos-move/framework/supra-framework";
const WORK_PREFIX = "/tmp/move-work/c9d2adfa73b44a90a040ffb18ff6c34e";

console.log("the exact output that was misreported:");
// Reproduced from the report: two framework warnings shown as if they were the user's files.
const reported = `
warning[W09001]: unused alias
  ┌─ ${FRAMEWORK_PREFIX}/sources/supra_governance.move:26:26
  │
26 │     use supra_framework::consensus_config;

warning[W09001]: unused alias
  ┌─ ${FRAMEWORK_PREFIX}/sources/block.move:6:22
  │
6 │     use std::option::Option;
`;
const own = ["sources/mypackage.move"];
const r = parseDiagnostics(reported, own);
check("both are parsed", r.length === 2, JSON.stringify(r));
check("both are marked external", r.every((d) => d.external), JSON.stringify(r.map((d) => d.external)));
check("both are warnings, not errors", r.every((d) => d.severity === "warning"),
  JSON.stringify(r.map((d) => d.severity)));
check("the framework paths are not mistaken for the project's",
  !r.some((d) => own.includes(d.path)), JSON.stringify(r.map((d) => d.path)));
check("no diagnostics are attributed to the user's file", r.filter((d) => !d.external).length === 0);

console.log();
console.log("a real error in the user's own file:");
const ownError = `
error[E01013]: unsupported language construct
  ┌─ ${WORK_PREFIX}/sources/mypackage.move:6:12
   │
 6 │         xs.length()
`;
const e = parseDiagnostics(ownError, own);
check("parsed", e.length === 1, JSON.stringify(e));
check("attributed to the user's file", e[0].external === false, JSON.stringify(e[0]));
check("severity is error", e[0].severity === "error", e[0].severity);
check("the code is captured", e[0].code === "E01013", e[0].code);
check("line and column are right", e[0].line === 6 && e[0].column === 12, `${e[0].line}:${e[0].column}`);
check("the message is captured", /unsupported language construct/.test(e[0].message), e[0].message);

console.log();
console.log("mixed output separates by origin:");
const mixed = `
warning[W09001]: unused alias
  ┌─ ${FRAMEWORK_PREFIX}/sources/block.move:6:22

error[E01002]: unexpected token
  ┌─ ${WORK_PREFIX}/sources/mypackage.move:5:5
  │
5 │     public fun v(): u64 { 1 }
`;
const m = parseDiagnostics(mixed, own);
check("two diagnostics", m.length === 2, JSON.stringify(m));
check("exactly one is the user's", m.filter((d) => !d.external).length === 1, JSON.stringify(m));
check("exactly one is external", m.filter((d) => d.external).length === 1, JSON.stringify(m));
check("the user's one is the error", m.find((d) => !d.external)?.severity === "error",
  JSON.stringify(m.find((d) => !d.external)));
check("the external one is the warning", m.find((d) => d.external)?.severity === "warning",
  JSON.stringify(m.find((d) => d.external)));

console.log();
console.log("a location belongs to the header immediately above it:");
// The rule is textual, not semantic: the toolchain prints a header and then its caret line, so a header
// without a location must not claim the next header's location.
const headerThenLocation = `
error[E01001]: invalid character
warning[W09001]: unused alias
  ┌─ ${WORK_PREFIX}/sources/mypackage.move:1:43
`;
const h = parseDiagnostics(headerThenLocation, own);
check("only one diagnostic is produced", h.length === 1, JSON.stringify(h));
check("it belongs to the header directly above the location", h[0].code === "W09001", JSON.stringify(h));
check("the location-less header is not invented", !h.some((d) => d.code === "E01001"), JSON.stringify(h));

// The real shape: header, then its own location, then the next header and its location.
const twoRealDiagnostics = `
error[E01001]: invalid character
  ┌─ ${WORK_PREFIX}/sources/mypackage.move:1:43

warning[W09001]: unused alias
  ┌─ ${WORK_PREFIX}/sources/other.move:9:5
`;
const two = parseDiagnostics(twoRealDiagnostics, ["sources/mypackage.move", "sources/other.move"]);
check("both real diagnostics are read", two.length === 2, JSON.stringify(two));
check("each keeps its own code",
  two[0]?.code === "E01001" && two[1]?.code === "W09001",
  JSON.stringify(two.map((d) => d.code)));
check("each keeps its own file",
  two[0]?.path === "sources/mypackage.move" && two[1]?.path === "sources/other.move",
  JSON.stringify(two.map((d) => d.path)));
check("severities are not swapped",
  two[0]?.severity === "error" && two[1]?.severity === "warning",
  JSON.stringify(two.map((d) => d.severity)));

console.log();
console.log("robustness:");
check("empty output yields nothing", parseDiagnostics("", own).length === 0);
check("output with no diagnostics yields nothing",
  parseDiagnostics("Compiling, may take a while...\nBUILDING probe\n", own).length === 0);
check("an ANSI-coloured error is still parsed", (() => {
  const coloured = `\u001b[0m\u001b[1m\u001b[38;5;9merror[E01001]\u001b[0m\u001b[1m: invalid character\u001b[0m\n  \u001b[0m\u001b[34m┌─\u001b[0m ${WORK_PREFIX}/sources/mypackage.move:1:43`;
  const parsed = parseDiagnostics(coloured, own);
  return parsed.length === 1 && parsed[0].severity === "error" && parsed[0].external === false;
})(), JSON.stringify(parseDiagnostics(`error[E01001]: invalid character\n  ┌─ ${WORK_PREFIX}/sources/mypackage.move:1:43`, own)));
check("stripAnsi removes escape sequences", !/\x1b/.test(stripAnsi("\u001b[31mred\u001b[0m")), stripAnsi("\u001b[31mred\u001b[0m"));
check("no ownPaths means everything is external", parseDiagnostics(ownError, []).every((d) => d.external));

console.log();
console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);