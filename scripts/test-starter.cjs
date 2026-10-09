/**
 * Compiles the default module for real.
 *
 * The starter is the first thing every user sees and the thing they judge the tool by, so it has to build.
 * Guessing at framework module names (`timestamp`, `now_microseconds`) would produce a starter that fails
 * on the first press — the worst possible first impression, and one no amount of reading the source would
 * catch.
 *
 * Run: node scripts/test-starter.cjs
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

const ADDR = "0x5c46920705e1f48375cca7d95313f3e80f70e5497ed21ef3a01be91142e60b75";

console.log("the starter is self-consistent:");
const starter = proj.starterModule("my_package");
check("file name matches the module name",
  starter.path === "sources/example.move" && /module my_package::example\b/.test(starter.source),
  starter.path);
check("moduleNameFromPath agrees with the declaration",
  proj.moduleNameFromPath(starter.path).toLowerCase() === "example",
  proj.moduleNameFromPath(starter.path));
check("uses the package name it was given",
  starter.source.includes("module my_package::example"), starter.source.slice(0, 60));

/**
 * The compiler refuses any non-ASCII byte in a source file. A single em dash in a doc comment was enough to
 * make every new project fail on its first compile, so the rule is asserted rather than remembered.
 */
const nonAscii = [...starter.source].filter((c) => c.charCodeAt(0) > 126 || (c.charCodeAt(0) < 32 && !"\n\t\r".includes(c)));
check("the source is pure ASCII", nonAscii.length === 0, `found ${JSON.stringify(nonAscii.slice(0, 8))}`);

console.log();
console.log("the starter exposes more than one callable:");
const fns = [...starter.source.matchAll(/public (entry )?fun (\w+)/g)].map((m) => ({ entry: !!m[1], name: m[2] }));
const names = fns.map((f) => f.name);
check("four functions", fns.length === 4, names.join(", "));
check("reads chain state", names.includes("is_keyless"), names.join(", "));
check("reads the chain clock", names.includes("now_micros"), names.join(", "));
check("has a pure function", names.includes("add"), names.join(", "));
check("has an entry, so a transaction can be sent and not only a read",
  fns.some((f) => f.entry && f.name === "greet"), JSON.stringify(fns));
check("three views and one entry",
  fns.filter((f) => !f.entry).length === 3 && fns.filter((f) => f.entry).length === 1,
  JSON.stringify(fns));
check("the entry emits an event rather than writing state",
  /event::emit\(/.test(starter.source) && !/move_to\(/.test(starter.source),
  "expected event::emit and no move_to");
check("declares the event struct",
  /#\[event\][\s\S]{0,80}struct Greeting has drop, store/.test(starter.source),
  "no event struct");

console.log();
console.log("every view is annotated, which is what makes it callable:");
// Move 2 does not treat `public fun` as a view on its own: the ABI marks a function `is_view` only when
// it carries `#[view]`, and the Interactor lists views from that flag. Verified against the deployed vault,
// which exposes 28 functions of which exactly its 19 `#[view]` ones report `is_view`.
const annotated = [...starter.source.matchAll(/#\[view\]\s*\n\s*public fun (\w+)/g)].map((m) => m[1]);
check("three views are annotated", annotated.length === 3, annotated.join(", "));
check("is_keyless is annotated", annotated.includes("is_keyless"), annotated.join(", "));
check("now_micros is annotated", annotated.includes("now_micros"), annotated.join(", "));
check("add is annotated", annotated.includes("add"), annotated.join(", "));
check("the entry is not annotated as a view", !/#\[view\][\s\S]{0,20}public entry/.test(starter.source));

// A view that lost its annotation would silently vanish from the Interactor rather than fail loudly, so the
// rule is asserted for the basic template too.
const basic = proj.starterModule("my_package", "basic");
const basicAnnotated = [...basic.source.matchAll(/#\[view\]\s*\n\s*public fun (\w+)/g)].map((m) => m[1]);
const basicFns = [...basic.source.matchAll(/public fun (\w+)/g)].map((m) => m[1]);
check("the basic template annotates all of its views",
  basicAnnotated.length === basicFns.length && basicFns.length > 0,
  `annotated ${basicAnnotated.join(",")} of ${basicFns.join(",")}`);
check("the basic template is smaller than the full one",
  basic.source.length < starter.source.length,
  `${basic.source.length} vs ${starter.source.length}`);

console.log();
console.log("and it compiles:");

(async () => {
  const res = await svc.compileMove(
    { "Move.toml": proj.buildMoveToml("my_package", ADDR), [starter.path]: starter.source },
    env.MOVE_COMPILE_TOKEN,
    { attempts: 1 }
  );

  if (!res.ok) {
    console.log("  FAILED:", res.error);
    console.log((res.stdout || "") + (res.stderr || ""));
  }
  check("compiles clean", res.ok === true, res.error);
  check("produces one module", (res.modules || []).length === 1, JSON.stringify(res.modules));
  check("the module id names it", (res.modules || [""])[0].endsWith("::example"), (res.modules || [])[0]);
  check("artifacts come back too", !!res.metadata && (res.bytecode || []).length === 1,
    `metadata=${!!res.metadata} bytecode=${(res.bytecode || []).length}`);

  console.log();
  console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})();