const path = require("path");
const { loadTs, makeChecker, report } = require("./load-module.cjs");

const { stableStringify, bundleSha, shouldReplace } = loadTs(
  path.join(__dirname, "..", "lib", "verify", "store.ts")
);
const { check, state } = makeChecker();

console.log("stableStringify:");
check(
  "sorts object keys recursively",
  stableStringify({ b: 1, a: { d: 2, c: 3 } }) === '{"a":{"c":3,"d":2},"b":1}',
  stableStringify({ b: 1, a: { d: 2, c: 3 } })
);

const bundle = {
  version: 1,
  network: "mainnet",
  address: "0x1",
  package: "p",
  upgradeNumber: 1,
  files: { "sources/a.move": "x" },
  manifest: "m",
  verification: {
    status: "verified",
    exactSource: true,
    sourceDigest: "A",
    computedDigest: "A",
    compilerVersion: null,
    frameworkRev: null,
    onchainModules: { a: "b" },
  },
};
const reordered = {
  verification: { ...bundle.verification },
  manifest: "m",
  files: { "sources/a.move": "x" },
  upgradeNumber: 1,
  package: "p",
  address: "0x1",
  network: "mainnet",
  version: 1,
};

(async () => {
  const sha = await bundleSha(bundle);
  const sha2 = await bundleSha(reordered);
  check("hashes are stable across key order", sha === sha2, `${sha} != ${sha2}`);
  check("hash is 64 lowercase hex", /^[0-9a-f]{64}$/.test(sha), sha);

  console.log();
  console.log("shouldReplace:");
  const rec = (status, exactSource) => ({
    network: "mainnet",
    address: "0x1",
    packageName: "p",
    upgradeNumber: 1,
    status,
    exactSource,
    sourceDigest: "A",
    computedDigest: null,
    bundleSha256: null,
    compilerVersion: null,
    frameworkRev: null,
    onchainModules: {},
    error: null,
    submittedBy: null,
    createdAt: 1,
    updatedAt: 1,
  });

  check("null + verified exact", shouldReplace(null, rec("verified", true)) === true);
  check("verified exact + failed", shouldReplace(rec("verified", true), rec("failed", false)) === false);
  check("pending + failed", shouldReplace(rec("pending", false), rec("failed", false)) === true);
  check("verified exact + unreproduced", shouldReplace(rec("verified", true), rec("unreproduced", true)) === false);
  check("verified non-exact + verified exact", shouldReplace(rec("verified", false), rec("verified", true)) === true);
  check("failed + verified", shouldReplace(rec("failed", false), rec("verified", true)) === true);
  check("unreproduced exact + verified exact", shouldReplace(rec("unreproduced", true), rec("verified", true)) === true);

  report(state);
})();
