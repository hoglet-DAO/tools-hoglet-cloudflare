/**
 * Pins the "a rejected compile is not a successful build" fix.
 *
 * The compile service answers **HTTP 200 with `ok: false`** when the compiler rejects the sources — the
 * request succeeded, the code did not. Both callers used to branch on the HTTP status, so a syntax error
 * fell through to the success path and the UI reported a green "compiled" badge for a package that never
 * built. These checks assert the failure is reported as a failure AND that it carries the compiler's own
 * message, since that message is the only thing that names the offending line.
 *
 * Run: node scripts/test-compile-failure.cjs
 */

const fs = require("fs");
const path = require("path");
const { loadTs } = require("./load-module.cjs");

const SERVICE_PATH = path.join(__dirname, "..", "lib", "move", "compileService.ts");
const svc = loadTs(SERVICE_PATH);
const proj = loadTs(path.join(__dirname, "..", "lib", "move", "project.ts"));
const browser = loadTs(path.join(__dirname, "..", "lib", "move", "compileBrowser.ts"), {
  "./compileService": svc,
});

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

const ADDR = "0xc4178a780e9e6324763c11eb9cd4fe1733d2f6099cb9580ae440f5c3d6d9b3b7";
// Built from the real generator, so this test cannot drift from what the app actually sends.
const TOML = proj.buildMoveToml("fail_probe", ADDR);

let failed = 0;
const check = (n, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + d}`);
  if (!c) failed++;
};

(async () => {
  console.log("compileMove against a real syntax error:");
  const bad = await svc.compileMove(
    {
      "Move.toml": TOML,
      "sources/fail_probe.move": 'module fail_probe::bad { public fun f(): u64 { "not a number" } }\n',
    },
    env.MOVE_COMPILE_TOKEN,
    { attempts: 1 }
  );

  check("reported as a failure", bad.ok === false, JSON.stringify(bad).slice(0, 160));
  check("carries the compiler's stdout/stderr", typeof bad.stdout === "string" && typeof bad.stderr === "string",
    `stdout=${typeof bad.stdout} stderr=${typeof bad.stderr}`);

  const detail = `${bad.stdout || ""}\n${bad.stderr || ""}`.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
  check("the message names the file", /fail_probe\.move/.test(detail), detail.slice(0, 200));
  check("the message names the error", /error\[E\d+\]/.test(detail), detail.slice(0, 200));
  check("no module ids are reported for a failure", Array.isArray(bad.modules) && bad.modules.length === 0,
    JSON.stringify(bad.modules));

  console.log();
  console.log("a valid package is still reported as a success:");
  const good = await svc.compileMove(
    { "Move.toml": TOML, "sources/fail_probe.move": "module fail_probe::ok { public fun f(): u64 { 1 } }\n" },
    env.MOVE_COMPILE_TOKEN,
    { attempts: 1 }
  );
  check("ok is true", good.ok === true, JSON.stringify(good).slice(0, 160));
  check("modules are returned", (good.modules || []).length === 1, JSON.stringify(good.modules));

  console.log();
  console.log("compileInBrowser: 200 + ok:false must NOT be treated as success:");

  // Mocked, because the browser helper talks to our own proxy. The shape mirrors exactly what the
  // service sends for a rejected compile, which is the case that regressed.
  const realFetch = global.fetch;
  global.fetch = async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: false,
        code: 1,
        modules: [],
        ms: 1200,
        stdout: "",
        stderr: 'error[E01001]: invalid character\n  --> sources/x.move:1:5',
      }),
    });

  const res = await browser.compileInBrowser({ "Move.toml": TOML });
  global.fetch = realFetch;

  check("browser result ok is false", res.ok === false, JSON.stringify(res).slice(0, 160));
  check("browser result keeps the compiler output", /E01001/.test(res.stderr || ""), res.stderr);
  check("browser result reports no modules", (res.modules || []).length === 0, JSON.stringify(res.modules));

  console.log();
  console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})();