/**
 * Verifies the test runner, end to end and in its parser.
 *
 * The parser is written against the summary line the toolchain prints, so the format is read from a real
 * run rather than assumed. A wrong assumption here is silent: the suite would simply never be reported as
 * having run, and the badge would stay empty while tests were passing.
 *
 * Run: node scripts/test-test-runner.cjs
 */

const fs = require("fs");
const path = require("path");
const { loadTs } = require("./load-module.cjs");

const proj = loadTs(path.join(__dirname, "..", "lib", "move", "project.ts"));
const svc = loadTs(path.join(__dirname, "..", "lib", "move", "compileService.ts"));
const diag = loadTs(path.join(__dirname, "..", "lib", "move", "diagnostics.ts"));

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

const ADDR = "0x5c46920705e1f48375cca7d95313f3e80f70e5497ed21ef3a01be91142e60b75";
const PKG = "testprobe";
const TOML = proj.buildMoveToml(PKG, ADDR);

let failed = 0;
const check = (n, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + d}`);
  if (!c) failed++;
};

console.log("summarizeTests, on the formats the toolchain emits:");
const ok = diag.summarizeTests("Running Move unit tests\nTest result: OK. Total tests: 3; passed: 3; failed: 0\n");
check("reads a passing suite", ok.ran && ok.ok, JSON.stringify(ok));
check("counts the tests", ok.total === 3 && ok.passed === 3 && ok.failed === 0, JSON.stringify(ok));

const bad = diag.summarizeTests("Test result: FAILED. Total tests: 4; passed: 3; failed: 1\n");
check("reads a failing suite", bad.ran && !bad.ok, JSON.stringify(bad));
check("counts the failures", bad.total === 4 && bad.passed === 3 && bad.failed === 1, JSON.stringify(bad));

// The verdict word is what is trusted, so a suite reporting FAILED is not green even if the counts look
// complete. Format drift across toolchain versions is the reason.
const contradictory = diag.summarizeTests("Test result: FAILED. Total tests: 2; passed: 2; failed: 0\n");
check("the verdict word wins over tidy counts", contradictory.ran && !contradictory.ok, JSON.stringify(contradictory));

const noSummary = diag.summarizeTests("BUILDING testprobe\n");
check("no summary means it did not run", noSummary.ran === false, JSON.stringify(noSummary));

const coloured = diag.summarizeTests("\u001b[32mTest result: OK. Total tests: 1; passed: 1; failed: 0\u001b[0m\n");
check("reads through ANSI colour", coloured.ran && coloured.ok, JSON.stringify(coloured));

console.log();
console.log("the /test endpoint, with a real package:");

(async () => {
  const passing = await svc.runMoveTests(
    {
      "Move.toml": TOML,
      "sources/T.move": `module ${PKG}::T {
    #[test]
    public fun adds() { assert!(1 + 1 == 2, 0) }
    #[test]
    public fun also_adds() { assert!(2 + 2 == 4, 0) }
}
`,
    },
    env.MOVE_COMPILE_TOKEN,
    { attempts: 1 }
  );

  check("the endpoint answers", typeof passing.ok === "boolean", JSON.stringify(passing).slice(0, 120));
  if (passing.ok) {
    const summary = diag.summarizeTests(passing.stdout || "");
    console.log(`   stdout summary: ${JSON.stringify(summary)}`);
    check("the summary is found", summary.ran === true, JSON.stringify((passing.stdout || "").slice(-300)));
    check("the suite passed", summary.ok === true, JSON.stringify(summary));
    check("two tests ran", summary.total === 2, JSON.stringify(summary));
  } else {
    console.log("   (test run failed:", passing.error, ")");
    console.log((passing.stdout || "") + (passing.stderr || ""));
  }

  console.log();
  console.log("a failing assertion is reported as a failure:");

  const failing = await svc.runMoveTests(
    {
      "Move.toml": TOML,
      "sources/T.move": `module ${PKG}::T {
    #[test]
    public fun broken() { assert!(1 == 2, 7) }
}
`,
    },
    env.MOVE_COMPILE_TOKEN,
    { attempts: 1 }
  );

  const failSummary = diag.summarizeTests(failing.stdout || "");
  console.log(`   ok=${failing.ok} summary=${JSON.stringify(failSummary)}`);
  check("a failing test is not reported as success", !(failing.ok === true && failSummary.ok === true),
    `ok=${failing.ok} summary=${JSON.stringify(failSummary)}`);

  console.log();
  console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})();