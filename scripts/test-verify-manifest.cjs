const path = require("path");
const { loadTs, makeChecker, report } = require("./load-module.cjs");

const { validateVerifyFiles } = loadTs(path.join(__dirname, "..", "lib", "verify", "validate.ts"));
const { sanitizeManifest } = loadTs(path.join(__dirname, "..", "lib", "verify", "manifest.ts"));
const { check, state } = makeChecker();

const BASE = [
  "[package]",
  'name = "amm"',
  'version = "1.0.0"',
  "",
  "[addresses]",
  'amm = "0x1"',
  "",
  "[dependencies.SupraFramework]",
  'git = "https://github.com/Entropy-Foundation/aptos-core.git"',
  'rev = "dev"',
  'subdir = "aptos-move/framework/supra-framework"',
  "",
  "[dependencies.RazorLibs]",
  'local = "../amm_libs"',
  "",
  "[dev-dependencies]",
  "",
].join("\n");

function withLocal(value) {
  return BASE.replace('local = "../amm_libs"', `local = "${value}"`);
}

console.log("validateVerifyFiles:");
const good = validateVerifyFiles({
  "sources/a.move": "",
  "deps/RazorLibs/Move.toml": "",
  "deps/RazorLibs/sources/a.move": "",
});
check("accepts sources and a dep tree", good.ok === true, JSON.stringify(good));
check("accepts an empty upload for a chain-source package", validateVerifyFiles({}).ok === true);
check("accepts and ignores tests/doc", (() => { const r = validateVerifyFiles({ "sources/a.move": "", "tests/a_test.move": "", "doc/readme.md": "" }); return r.ok === true && !("tests/a_test.move" in r.files) && !("doc/readme.md" in r.files); })());

const rootManifest = validateVerifyFiles({ "Move.toml": "" });
check("rejects a root Move.toml", rootManifest.ok === false, JSON.stringify(rootManifest));
check("names the chain as the source of the manifest", /root manifest/i.test(rootManifest.error || ""), rootManifest.error);

for (const bad of ["../x.move", "/x.move", "sources/../../x", "sources\\x", "sources/a.txt"]) {
  const res = validateVerifyFiles({ [bad]: "" });
  check(`rejects ${bad}`, res.ok === false, JSON.stringify(res));
}

const proto = validateVerifyFiles(JSON.parse('{"__proto__": ""}'));
check("rejects __proto__", proto.ok === false, JSON.stringify(proto));

const longPath = "sources/" + "a".repeat(150) + ".move";
check("rejects an over-long path", validateVerifyFiles({ [longPath]: "" }).ok === false);

const tooMany = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`sources/f${i}.move`, ""]));
check("rejects 201 files", validateVerifyFiles(tooMany).ok === false);

check("rejects a file over 2 MB", validateVerifyFiles({ "sources/big.move": "x".repeat(2 * 1024 * 1024 + 1) }).ok === false);

console.log();
console.log("sanitizeManifest:");
const rewritten = sanitizeManifest(BASE);
check("accepts the base manifest", rewritten.ok === true, JSON.stringify(rewritten));
check("rewrites the local dep", rewritten.ok && rewritten.manifest.includes('local = "deps/RazorLibs"'), rewritten.ok && rewritten.manifest);
check("drops the original relative path", rewritten.ok && !rewritten.manifest.includes("../amm_libs"));
check("reports the local dep", rewritten.ok && rewritten.localDeps.includes("RazorLibs"), JSON.stringify(rewritten.localDeps));
check("reports the git dep", rewritten.ok && rewritten.gitDeps.some((d) => d.name === "SupraFramework" && d.rev === "dev"), JSON.stringify(rewritten.gitDeps));

check("rejects an absolute local", sanitizeManifest(withLocal("/etc")).ok === false);
check("rejects a backslash local", sanitizeManifest(withLocal("..\\\\x")).ok === false);
// Ruling: a relative local is rewritten, never used, so `../x` is safe. Only
// absolute and backslash paths are refused. See the ledger.
check("accepts and rewrites ../x", sanitizeManifest(withLocal("../x")).ok === true);

function withGit(value) {
  return BASE.replace('git = "https://github.com/Entropy-Foundation/aptos-core.git"', `git = "${value}"`);
}
check("rejects http git", sanitizeManifest(withGit("http://github.com/x/y")).ok === false);
check("rejects a private IP git host", sanitizeManifest(withGit("https://192.168.1.1/x")).ok === false);
check("rejects a non-github git host", sanitizeManifest(withGit("https://gitlab.com/x")).ok === false);

const newlineRev = BASE.replace('rev = "dev"', 'rev = "dev\nmalicious"');
check("rejects a rev with a newline", sanitizeManifest(newlineRev).ok === false);

const inline = BASE.replace("[dependencies.RazorLibs]", '[dependencies]\nX = { git = "http://evil/x" }');
check("rejects an inline dependency table", sanitizeManifest(inline).ok === false);

const commented = BASE.replace("[dependencies.RazorLibs]", "[dependencies.RazorLibs] # libs");
const commentedRes = sanitizeManifest(commented);
check("accepts a header comment and still rewrites the dep", commentedRes.ok && commentedRes.localDeps.includes("RazorLibs"), JSON.stringify(commentedRes));

const unknown = BASE.replace(
  'subdir = "aptos-move/framework/supra-framework"',
  'subdir = "aptos-move/framework/supra-framework"\nfoo = "bar"'
);
check("rejects an unknown dependency key", sanitizeManifest(unknown).ok === false);

const badSubdir = BASE.replace('"aptos-move/framework/supra-framework"', '"../../etc"');
check("rejects a traversing subdir", sanitizeManifest(badSubdir).ok === false);

check("rejects a rev that looks like a flag", sanitizeManifest(BASE.replace('rev = "dev"', 'rev = "-x"')).ok === false);

const gitDep = [
  "[package]",
  'name = "amm"',
  "",
  "[dependencies.SupraFramework]",
  'git = "https://github.com/Entropy-Foundation/aptos-core.git"',
  'rev = "dev"',
  "",
  "[dependencies.RazorLibs]",
  'git = "https://github.com/example/razor.git"',
  'rev = "main"',
  'subdir = "libs"',
  "",
].join("\n");
const bundled = sanitizeManifest(gitDep, { providedDeps: ["RazorLibs"] });
check("bundles a provided git dep as local", bundled.ok && bundled.manifest.includes('local = "deps/RazorLibs"'), bundled.ok && bundled.manifest);
check("drops the bundled git url", bundled.ok && !bundled.manifest.includes("example/razor"), bundled.ok && bundled.manifest);
check("keeps a git dep that was not provided", bundled.ok && bundled.manifest.includes("Entropy-Foundation/aptos-core"), bundled.ok && bundled.manifest);

const commit = "a".repeat(40);
const pinned = sanitizeManifest(BASE, { frameworkCommit: commit });
check("pins the framework commit", pinned.ok && pinned.manifest.includes(`rev = "${commit}"`), pinned.ok && pinned.manifest);
check("reports the pinned rev", pinned.ok && pinned.gitDeps.some((d) => d.name === "SupraFramework" && d.rev === commit), JSON.stringify(pinned.ok && pinned.gitDeps));

report(state);
