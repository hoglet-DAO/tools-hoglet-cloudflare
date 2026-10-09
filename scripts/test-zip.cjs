/**
 * Verifies the hand-written ZIP writer by extracting its output with a real unzip tool.
 *
 * A ZIP is positional: a wrong offset or CRC produces an archive that opens in some tools and not others.
 * Asserting on the bytes would only prove the writer is self-consistent, so this writes an archive to disk
 * and has PowerShell's `Expand-Archive` unpack it — an implementation that has no knowledge of ours.
 *
 * Run: node scripts/test-zip.cjs
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { createRequire } = require("module");
const { loadTs } = require("./load-module.cjs");

const { createZip } = loadTs(path.join(__dirname, "..", "lib", "move", "zip.ts"));

let failed = 0;
const check = (n, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + d}`);
  if (!c) failed++;
};

const WORK = path.join(os.tmpdir(), "opencode", `ziptest-${Date.now()}`);
const ZIP_PATH = path.join(WORK, "project.zip");
const OUT_DIR = path.join(WORK, "out");

const MOVE_TOML = `[package]\nname = "probe"\n\n[addresses]\nprobe = "0x1"\n`;
const POOL = `module probe::Pool {\n    public fun v(): u64 { 1 }\n}\n`;
const DEEP = `module probe::Deep {\n    public fun v(): u64 { 2 }\n}\n`;

fs.mkdirSync(WORK, { recursive: true });

console.log("building an archive:");
const bytes = createZip([
  { path: "Move.toml", content: MOVE_TOML },
  { path: "sources/Pool.move", content: POOL },
  { path: "sources/nested/Deep.move", content: DEEP },
]);
check("produced bytes", bytes.length > 0, String(bytes.length));
check("starts with the local file header signature",
  bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04,
  [...bytes.slice(0, 4)].map((b) => b.toString(16)).join(" "));
check("ends with the end-of-central-directory signature",
  bytes[bytes.length - 22] === 0x50 && bytes[bytes.length - 21] === 0x4b &&
  bytes[bytes.length - 20] === 0x05 && bytes[bytes.length - 19] === 0x06,
  [...bytes.slice(-22, -18)].map((b) => b.toString(16)).join(" "));

fs.writeFileSync(ZIP_PATH, Buffer.from(bytes));

console.log();
console.log("extracting with PowerShell's Expand-Archive:");
let extracted = false;
try {
  execFileSync(
    "powershell",
    ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${ZIP_PATH}' -DestinationPath '${OUT_DIR}' -Force`],
    { stdio: "pipe" }
  );
  extracted = true;
} catch (e) {
  console.log("  (extract failed:", String(e.stderr || e.message).slice(0, 300), ")");
}
check("archive extracts without error", extracted);

if (extracted) {
  const read = (rel) => {
    const p = path.join(OUT_DIR, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  };

  check("Move.toml round-trips byte for byte", read("Move.toml") === MOVE_TOML, JSON.stringify(read("Move.toml")));
  check("sources/Pool.move round-trips", read("sources/Pool.move") === POOL, JSON.stringify(read("sources/Pool.move")));
  check("a nested path is preserved", read("sources/nested/Deep.move") === DEEP,
    JSON.stringify(read("sources/nested/Deep.move")));
}

console.log();
console.log("edge cases:");
check("an empty archive is still a valid one", (() => {
  const empty = createZip([]);
  return empty.length === 22 && empty[0] === 0x50 && empty[1] === 0x4b;
})(), "expected the 22-byte EOCD only");

check("duplicate paths are rejected rather than written", (() => {
  try {
    createZip([
      { path: "sources/a.move", content: "x" },
      { path: "sources/a.move", content: "y" },
    ]);
    return false;
  } catch {
    return true;
  }
})());

check("non-ASCII content survives", (() => {
  const text = "// café — 日本語 ✓\nmodule p::m {}\n";
  const zip = createZip([{ path: "sources/Uni.move", content: text }]);
  const round = Buffer.from(zip).toString("utf8");
  return round.includes(text);
})());

check("a backslash path is normalised to a forward slash", (() => {
  const zip = createZip([{ path: "sources\\Win.move", content: "x" }]);
  const text = Buffer.from(zip).toString("latin1");
  return text.includes("sources/Win.move") && !text.includes("sources\\Win.move");
})());

fs.rmSync(WORK, { recursive: true, force: true });

console.log();
console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);