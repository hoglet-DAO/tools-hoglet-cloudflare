#!/usr/bin/env node
/**
 * Repairs node_modules after an interrupted `npm install` that deleted packages.
 *
 * package-lock.json is the source of truth: every entry under "packages" has the
 * exact version and integrity, which is enough to pull the tarball straight out of
 * the local npm cache (_cacache) with no registry access.
 *
 * Usage: node scripts/repair-node-modules.cjs [--dry]
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const root = process.cwd();
const dry = process.argv.includes("--dry");
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));

const cacheRoot = path.join(os.homedir(), "AppData", "Local", "npm-cache", "_cacache");
const stagingRoot = path.join(root, ".restore-tmp");

function contentPathFor(integrity) {
  const [algo, b64] = integrity.split("-");
  const hex = Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("hex");
  return path.join(cacheRoot, "content-v2", algo, hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
}

function isIntact(dir) {
  return fs.existsSync(path.join(dir, "package.json"));
}

const missing = [];
for (const [pkgPath, meta] of Object.entries(lock.packages || {})) {
  if (!pkgPath.startsWith("node_modules/")) continue;
  if (meta.link) continue;
  const dir = path.join(root, pkgPath);
  if (isIntact(dir)) continue;
  missing.push({ pkgPath, version: meta.version, integrity: meta.integrity });
}

console.log(`packages in lock: ${Object.keys(lock.packages || {}).length}`);
console.log(`missing from node_modules: ${missing.length}`);

if (!missing.length) process.exit(0);
if (dry) {
  missing.forEach((m) => console.log(` - ${m.pkgPath}@${m.version}`));
  process.exit(0);
}

fs.mkdirSync(stagingRoot, { recursive: true });

let restored = 0;
const failed = [];
const noCache = [];

for (const { pkgPath, version, integrity } of missing) {
  const dir = path.join(root, pkgPath);
  if (!integrity) {
    failed.push(`${pkgPath}@${version} (no integrity in lock)`);
    continue;
  }
  const tgz = contentPathFor(integrity);
  if (!fs.existsSync(tgz)) {
    noCache.push(`${pkgPath}@${version}`);
    continue;
  }
  const bare = pkgPath.split("node_modules/").pop();
  const tmp = fs.mkdtempSync(path.join(stagingRoot, "x-"));
  try {
    execFileSync("tar", ["-xzf", tgz, "-C", tmp], { stdio: "pipe" });
    const candidates = ["package", bare, `${bare}-${version}`];
    const src = candidates.map((c) => path.join(tmp, c)).find((c) => isIntact(c));
    if (!src) {
      failed.push(`${pkgPath}@${version} (unexpected tarball layout)`);
      continue;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.cpSync(src, dir, { recursive: true });
    restored++;
  } catch (e) {
    failed.push(`${pkgPath}@${version} (${e.message.split("\n")[0]})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

fs.rmSync(stagingRoot, { recursive: true, force: true });

console.log(`restored: ${restored}`);
if (noCache.length) {
  console.log(`\nnot in local cache (${noCache.length}):`);
  noCache.forEach((n) => console.log(` ! ${n}`));
}
if (failed.length) {
  console.log(`\nerrors (${failed.length}):`);
  failed.forEach((n) => console.log(` x ${n}`));
}