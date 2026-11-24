const path = require("path");
const { loadTs, makeChecker, report } = require("./load-module.cjs");
const { sourceDigest } = loadTs(path.join(__dirname, "..", "lib", "verify", "digest.ts"));
const { check, state } = makeChecker();

const manifest = '[package]\nname = "demo"\nversion = "1.0.0"\n\n[addresses]\ndemo = "0x1"\n';
const files = {
  "sources/a.move": "module 0x1::a { public fun f(): u64 { 1 } }\n",
  "sources/b.move": "module 0x1::b { public fun g(): u64 { 2 } }\n",
  "tests/a_test.move": "module 0x1::a_test { #[test] fun t() {} }\n",
  "doc/readme.md": "ignored",
};

(async () => {
  const digest = await sourceDigest(manifest, files);
  check("matches the known vector", digest === "6C4EE5BA33BC223673C5FD1FE766BCF66120F94234A6C993138CD797E5AF18F5", digest);
  const withoutTests = await sourceDigest(manifest, {
    "sources/a.move": files["sources/a.move"],
    "sources/b.move": files["sources/b.move"],
  });
  check("tests and docs do not change the digest", withoutTests === digest, withoutTests);
  const changed = await sourceDigest(manifest, { ...files, "sources/a.move": files["sources/a.move"] + " " });
  check("a source byte changes the digest", changed !== digest, changed);
  report(state);
})();
