/**
 * Verifies the deploy artifacts the compile service now returns.
 *
 * Shape checks alone would pass on any hex string. These decode the bytes and assert on their structure:
 * Move bytecode starts with a known magic, and the package metadata is a BCS `String` whose first byte is
 * the length of the package name. If either is wrong the publish would be rejected on-chain, or worse,
 * would store metadata describing a different package.
 *
 * Run: node scripts/test-artifacts.cjs
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

const ADDR = "0x5c46920705e1f48375cca7d95313f3e80f70e5497ed21ef3a01be91142e60b75";
const PKG = "artifactprobe";
const TOML = proj.buildMoveToml(PKG, ADDR);

let failed = 0;
const check = (n, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + d}`);
  if (!c) failed++;
};

const hexToBytes = (hex) => {
  const body = hex.replace(/^0x/, "");
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(body.substr(i * 2, 2), 16);
  return out;
};

(async () => {
  const res = await svc.compileMove(
    {
      "Move.toml": TOML,
      "sources/A.move": `module ${PKG}::A { public fun v(): u64 { 1 } }\n`,
      "sources/B.move": `module ${PKG}::B { public fun v(): u64 { 2 } }\n`,
    },
    env.MOVE_COMPILE_TOKEN,
    { attempts: 1 }
  );

  if (!res.ok) {
    console.log("compile failed:", res.error);
    console.log((res.stdout || "") + (res.stderr || ""));
    process.exit(1);
  }

  console.log("shape:");
  check("modules are 0x-prefixed", res.modules.every((m) => m.startsWith("0x")), JSON.stringify(res.modules));
  check("metadata is present", typeof res.metadata === "string" && res.metadata.length > 0, String(res.metadata));
  check("metadata is 0x-prefixed", (res.metadata || "").startsWith("0x"), (res.metadata || "").slice(0, 12));
  check("metadata is even-length hex",
    /^0x([0-9a-fA-F]{2})+$/.test(res.metadata || ""),
    `${(res.metadata || "").length} chars`);
  check("bytecode count matches modules", res.bytecode.length === res.modules.length,
    `${res.bytecode.length} vs ${res.modules.length}`);
  check("every bytecode entry is 0x-prefixed hex",
    res.bytecode.every((b) => /^0x([0-9a-fA-F]{2})+$/.test(b)),
    JSON.stringify(res.bytecode.map((b) => b.slice(0, 8))));
  check("artifactsOmitted is false", res.artifactsOmitted === false, String(res.artifactsOmitted));

  console.log();
  console.log("the bytes are structurally valid:");

  // Move bytecode begins with the magic 0xA11CEB0B, then a version, then a table-count varint.
  const MOVE_MAGIC = [0xa1, 0x1c, 0xeb, 0x0b];
  for (let i = 0; i < res.bytecode.length; i++) {
    const bytes = hexToBytes(res.bytecode[i]);
    const magicOk = MOVE_MAGIC.every((b, j) => bytes[j] === b);
    check(`bytecode[${i}] starts with the Move magic`, magicOk,
      [...bytes.slice(0, 4)].map((b) => b.toString(16)).join(" "));
  }

  // The metadata is a BCS PackageMetadata, whose first field is `name: String` — a ULEB length followed by
  // the bytes. Matching the package name proves it describes THIS package.
  const meta = hexToBytes(res.metadata);
  check("metadata's first byte is the package name length",
    meta[0] === PKG.length, `got ${meta[0]}, expected ${PKG.length}`);
  const name = String.fromCharCode(...meta.slice(1, 1 + PKG.length));
  check("metadata names this package", name === PKG, `got "${name}"`);

  console.log();
  console.log("the bytecode pairs with the module ids:");
  const labels = res.modules.map((m, i) => proj.moduleLabel(m, i));
  check("labels are derived from the ids", labels.join() === "A,B", labels.join());
  check("a malformed id falls back to a positional name",
    proj.moduleLabel("nonsense", 3) === "module_4", proj.moduleLabel("nonsense", 3));
  check("an undefined id falls back too",
    proj.moduleLabel(undefined, 0) === "module_1", proj.moduleLabel(undefined, 0));

  console.log();
  console.log("the same sources compile to the same artifacts (cache key stability):");
  const again = await svc.compileMove(
    {
      "sources/B.move": `module ${PKG}::B { public fun v(): u64 { 2 } }\n`,
      "Move.toml": TOML,
      "sources/A.move": `module ${PKG}::A { public fun v(): u64 { 1 } }\n`,
    },
    env.MOVE_COMPILE_TOKEN,
    { attempts: 1 }
  );
  check("reordered input yields identical bytecode",
    again.ok && again.bytecode.join() === res.bytecode.join(),
    again.ok ? "differs" : again.error);

  console.log();
  console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})();