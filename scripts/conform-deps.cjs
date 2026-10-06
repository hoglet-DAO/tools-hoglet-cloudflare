#!/usr/bin/env node
/**
 * Realigns installed dependency versions with the ranges their dependents declare.
 *
 * Repairing a damaged node_modules from cache tends to install "newest available",
 * which can be incompatible (e.g. a package pinned to an older major). This walks
 * every installed package, checks each dependency range, and reinstalls a cached
 * version that satisfies it when the installed one does not.
 *
 * Usage: node scripts/conform-deps.cjs [maxPasses]
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const root = process.cwd();
const maxPasses = Number(process.argv[2] || 6);
const cacheRoot = path.join(os.homedir(), "AppData", "Local", "npm-cache", "_cacache");
const indexRoot = path.join(cacheRoot, "index-v5");

/* ----------------------------- cache index ----------------------------- */

const cacheIndex = new Map(); // bareName -> [versions]
const cacheIntegrity = new Map(); // `${bare}@${version}` -> integrity

(function buildIndex() {
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
      for (const line of raw.split("\n")) {
        const url = line.match(/"url":"https?:\/\/[^"]*\/([^/"]+)-(\d+\.\d+\.\d+[^"]*)\.tgz"/);
        const integ = line.match(/"integrity":"(sha\d+-[A-Za-z0-9+/=]+)"/);
        if (!url || !integ) continue;
        const [, file, version] = url;
        if (!cacheIndex.has(file)) cacheIndex.set(file, []);
        if (!cacheIndex.get(file).includes(version)) cacheIndex.get(file).push(version);
        cacheIntegrity.set(`${file}@${version}`, integ[1]);
      }
    }
  }
})();

/* ------------------------------- semver -------------------------------- */

function parse(v) {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  return m ? { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] } : null;
}

function cmp(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 0;
  for (const k of ["major", "minor", "patch"]) {
    if (pa[k] !== pb[k]) return pa[k] - pb[k];
  }
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  return pa.pre < pb.pre ? -1 : 1;
}

function satisfiesSimple(version, range) {
  const r = range.trim();
  if (!r || r === "*" || r === "latest") return true;
  const pv = parse(version);
  if (!pv) return false;

  const m = r.match(/^(\^|~|>=|<=|>|<|=)?\s*v?(.+)$/);
  if (!m) return false;
  const op = m[1] || "=";
  const target = m[2].trim();
  const pt = parse(target);
  if (!pt) return false;

  if (op === "=") return cmp(version, target) === 0;
  if (op === ">") return cmp(version, target) > 0;
  if (op === ">=") return cmp(version, target) >= 0;
  if (op === "<") return cmp(version, target) < 0;
  if (op === "<=") return cmp(version, target) <= 0;

  if (op === "^") {
    if (cmp(version, target) < 0) return false;
    if (pt.major > 0) return pv.major === pt.major;
    if (pt.minor > 0) return pv.major === 0 && pv.minor === pt.minor;
    return pv.major === 0 && pv.minor === 0 && pv.patch === pt.patch;
  }
  if (op === "~") {
    if (cmp(version, target) < 0) return false;
    return pv.major === pt.major && pv.minor === pt.minor;
  }
  return false;
}

function satisfies(version, range) {
  return String(range)
    .split("||")
    .some((part) =>
      part
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .every((piece) => satisfiesSimple(version, piece))
    );
}

/* ------------------------------ install -------------------------------- */

function isIntact(dir) {
  return fs.existsSync(path.join(dir, "package.json"));
}

function install(pkg, version) {
  const bare = pkg.startsWith("@") ? pkg.split("/")[1] : pkg;
  const integrity = cacheIntegrity.get(`${bare}@${version}`);
  if (!integrity) return false;
  const [algo, b64] = integrity.split("-");
  const hex = Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("hex");
  const tgz = path.join(cacheRoot, "content-v2", algo, hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
  if (!fs.existsSync(tgz)) return false;
  const tmp = fs.mkdtempSync(path.join(root, ".restore-tmp-"));
  try {
    execFileSync("tar", ["-xzf", tgz, "-C", tmp], { stdio: "pipe" });
    const src = ["package", bare, `${bare}-${version}`]
      .map((c) => path.join(tmp, c))
      .find((c) => isIntact(c));
    if (!src) return false;
    const dest = path.join(root, "node_modules", pkg);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
    return true;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function installedVersion(pkg) {
  const dir = path.join(root, "node_modules", pkg);
  if (!isIntact(dir)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;
  } catch {
    return null;
  }
}

function listInstalled() {
  const out = [];
  const nm = path.join(root, "node_modules");
  for (const entry of fs.readdirSync(nm, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(nm, entry.name);
      if (!fs.existsSync(scopeDir)) continue;
      for (const sub of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (!sub.name.startsWith(".")) out.push(`${entry.name}/${sub.name}`);
      }
    } else {
      out.push(entry.name);
    }
  }
  return out;
}

/* ------------------------------- main ---------------------------------- */

for (let pass = 1; pass <= maxPasses; pass++) {
  const fixes = [];
  for (const pkg of listInstalled()) {
    const dir = path.join(root, "node_modules", pkg);
    if (!isIntact(dir)) continue;
    let meta;
    try {
      meta = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    const deps = { ...meta.dependencies, ...meta.optionalDependencies };
    for (const [dep, range] of Object.entries(deps)) {
      if (/^(file:|link:|git|https?:|workspace:|npm:)/.test(range)) continue;
      const current = installedVersion(dep);
      if (current && satisfies(current, range)) continue;
      const bare = dep.startsWith("@") ? dep.split("/")[1] : dep;
      const candidates = (cacheIndex.get(bare) || [])
        .filter((v) => satisfies(v, range))
        .sort((a, b) => cmp(b, a));
      if (!candidates.length) {
        fixes.push({ dep, range, current, note: "no cached version satisfies range" });
        continue;
      }
      const pick = candidates.find((v) => install(dep, v));
      if (pick) fixes.push({ dep, range, current, pick });
    }
  }

  for (const dir of fs.readdirSync(root)) {
    if (dir.startsWith(".restore-tmp-")) fs.rmSync(path.join(root, dir), { recursive: true, force: true });
  }

  const applied = fixes.filter((f) => f.pick);
  const unresolved = fixes.filter((f) => !f.pick);
  console.log(`pass ${pass}: realigned ${applied.length}, unresolved ${unresolved.length}`);
  applied.forEach((f) => console.log(`  ${f.dep}: ${f.current || "missing"} -> ${f.pick} (${f.range})`));
  if (unresolved.length) {
    unresolved.forEach((f) =>
      console.log(`  ! ${f.dep}@${f.current || "?"} does not satisfy ${f.range} (${f.note})`)
    );
  }
  if (!applied.length) {
    console.log("no further changes possible from local cache");
    break;
  }
}