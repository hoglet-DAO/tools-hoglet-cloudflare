#!/usr/bin/env node
/**
 * Restores a package into node_modules from the local npm cache (_cacache).
 *
 * Usage: node scripts/restore-from-npm-cache.cjs <pkgName> <version> [<integrity>]
 *
 * With no <integrity>, the cache index is searched for
 * https://registry.npmjs.org/<name>/-/<name>-<version>.tgz
 *
 * Needed when an interrupted `npm install` removes packages while this machine
 * has no registry access: the tarball is still in the content-addressable cache.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const [, , pkgName, version, integrityArg] = process.argv;

if (!pkgName || !version) {
  console.error("usage: restore-from-npm-cache.cjs <pkgName> <version> [integrity]");
  process.exit(2);
}

// npm nests the scope in the path but drops it from the tarball filename:
//   @scope/name@1.2.3 -> https://registry.npmjs.org/@scope/name/-/name-1.2.3.tgz
const bareName = pkgName.startsWith("@") ? pkgName.split("/")[1] : pkgName;
const tarName = `${bareName}-${version}.tgz`;
const url = `https://registry.npmjs.org/${pkgName}/-/${tarName}`;

const cacheRoot = path.join(os.homedir(), "AppData", "Local", "npm-cache", "_cacache");
const indexRoot = path.join(cacheRoot, "index-v5");

function findIntegrity() {
  // First try the canonical URL, then fall back to any cached tarball for this
  // name+version (mirrors and older entries use different URL shapes).
  const wanted = [`"key":"make-fetch-happen:request-cache:${url}"`, tarName];
  const found = new Set();
  const stack = [indexRoot];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
        continue;
      }
      let raw;
      try {
        raw = fs.readFileSync(full, "utf8");
      } catch {
        continue;
      }
      if (!raw.includes(tarName)) continue;
      for (const line of raw.split("\n")) {
        if (!line.includes(tarName)) continue;
        const m = line.match(/"integrity":"(sha\d+-[A-Za-z0-9+/=]+)"/);
        if (!m) continue;
        if (line.includes(wanted[0])) return m[1];
        found.add(m[1]);
      }
    }
  }
  return found.size ? [...found][0] : null;
}

const integrity = integrityArg || findIntegrity();
if (!integrity) {
  console.error(`not found in cache index: ${url}`);
  process.exit(1);
}

const [algo, b64] = integrity.split("-");
const hex = Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("hex");
const contentPath = path.join(
  cacheRoot,
  "content-v2",
  algo,
  hex.slice(0, 2),
  hex.slice(2, 4),
  hex.slice(4)
);

if (!fs.existsSync(contentPath)) {
  console.error(`content missing for ${integrity}: ${contentPath}`);
  process.exit(1);
}

// Stage inside the project so the final move stays on one filesystem (EXDEV otherwise).
const tmp = fs.mkdtempSync(path.join(process.cwd(), ".restore-tmp-"));
const tgz = path.join(tmp, tarName);
fs.copyFileSync(contentPath, tgz);

const target = path.join(process.cwd(), "node_modules", pkgName);
const staging = path.join(tmp, "unpack");
fs.mkdirSync(staging, { recursive: true });
execFileSync("tar", ["-xzf", tgz, "-C", staging], { stdio: "inherit" });

// Most tarballs extract into `package/`, but some (@types/*) use their own name.
const candidates = ["package", bareName, `${bareName}-${version}`];
const extracted = candidates
  .map((c) => path.join(staging, c))
  .find((c) => fs.existsSync(path.join(c, "package.json")));

if (!extracted) {
  console.error(`unexpected tarball layout in ${tgz}`);
  console.error(`  top level: ${fs.readdirSync(staging).join(", ")}`);
  process.exit(1);
}

if (fs.existsSync(target)) {
  fs.rmSync(target, { recursive: true, force: true });
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(extracted, target, { recursive: true });

console.log(`restored ${pkgName}@${version} -> node_modules/${pkgName}`);
fs.rmSync(tmp, { recursive: true, force: true });