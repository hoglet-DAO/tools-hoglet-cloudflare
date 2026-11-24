const path = require("path");
const { loadTs, makeChecker, report } = require("./load-module.cjs");

const { verifyPackage } = loadTs(path.join(__dirname, "..", "lib", "verify", "service.ts"));
const { sourceDigest } = loadTs(path.join(__dirname, "..", "lib", "verify", "digest.ts"));
const { check, state } = makeChecker();

const MANIFEST = '[package]\nname = "demo"\nversion = "1.0.0"\n\n[addresses]\ndemo = "0x1"\n';
const SOURCE = "module 0x1::a {}\n";
const UPLOAD = { "sources/a.move": SOURCE };

function makeDeps(overrides = {}) {
  const calls = { compile: 0, bundles: 0, records: [], files: null };
  const deps = {
    fetchRegistry: async () => [pkg],
    fetchModuleBytecode: async () => ({ a: "0xaa" }),
    compile: async (files) => {
      calls.compile++;
      calls.files = files;
      return {
        ok: true,
        code: 0,
        modules: ["0x1::a"],
        bytecode: ["0xaa"],
        metadata: null,
        artifactsOmitted: false,
        ms: 1,
        stdout: "",
        stderr: "",
      };
    },
    getVerification: async () => null,
    putVerification: async (_env, record) => calls.records.push(record),
    putBundle: async () => {
      calls.bundles++;
      return "f".repeat(64);
    },
    ...overrides,
  };
  return { deps, calls };
}

let pkg;

(async () => {
  const digest = await sourceDigest(MANIFEST, UPLOAD);
  pkg = {
    name: "demo",
    upgradeNumber: 76,
    sourceDigest: digest,
    manifest: MANIFEST,
    modules: [{ name: "a", source: SOURCE }],
    deps: [],
  };

  const base = {
    env: {},
    token: "t",
    network: "mainnet",
    address: "0x1",
    packageName: "demo",
    files: UPLOAD,
  };

  {
    const { deps, calls } = makeDeps();
    const out = await verifyPackage({ ...base, deps });
    check("digest + bytecode match", out.ok === true && out.record.status === "verified", JSON.stringify(out.record));
    check("exact source is true", out.record.exactSource === true);
    check("bundle stored", calls.bundles === 1);
    check("record stored", calls.records.length === 1 && calls.records[0].status === "verified");
    check("compile received the manifest and sources", calls.files["Move.toml"].includes('name = "demo"') && calls.files["sources/a.move"] === SOURCE, JSON.stringify(calls.files));
  }

  {
    pkg.sourceDigest = "00";
    const { deps } = makeDeps();
    const out = await verifyPackage({ ...base, deps });
    check("bytecode only is verified, not exact", out.record.status === "verified" && out.record.exactSource === false, JSON.stringify(out.record));
    pkg.sourceDigest = digest;
  }

  {
    const { deps, calls } = makeDeps({ fetchModuleBytecode: async () => ({ a: "0xff" }) });
    const out = await verifyPackage({ ...base, deps });
    check("digest only is unreproduced", out.record.status === "unreproduced" && out.record.exactSource === true, JSON.stringify(out.record));
    check("unreproduced stores the bundle", calls.bundles === 1);
  }

  {
    pkg.sourceDigest = "00";
    const { deps, calls } = makeDeps({ fetchModuleBytecode: async () => ({ a: "0xff" }) });
    const out = await verifyPackage({ ...base, deps });
    check("neither is failed", out.ok === false && out.record.status === "failed" && out.errorCode === "failed", JSON.stringify(out));
    check("failed stores no bundle", calls.bundles === 0);
    pkg.sourceDigest = digest;
  }

  {
    const cached = { ...base, packageName: "demo", upgradeNumber: 76, status: "verified", exactSource: true, sourceDigest: digest, computedDigest: digest, bundleSha256: "f".repeat(64), compilerVersion: null, frameworkRev: null, onchainModules: {}, error: null, submittedBy: null, createdAt: 1, updatedAt: 1 };
    const { deps, calls } = makeDeps({ getVerification: async () => cached });
    const out = await verifyPackage({ ...base, deps });
    check("cache hit returns the record", out.ok === true && out.record.bundleSha256 === cached.bundleSha256, JSON.stringify(out));
    check("cache hit does not compile", calls.compile === 0);
  }

  {
    const { deps, calls } = makeDeps();
    const out = await verifyPackage({ ...base, files: {}, deps });
    check("chain source is used with no upload", out.ok === true && calls.files["sources/a.move"] === SOURCE, JSON.stringify(calls.files));
  }

  {
    const { deps } = makeDeps({ fetchModuleBytecode: async () => ({ a: "0xaa", b: "0xbb" }) });
    const out = await verifyPackage({ ...base, deps });
    check("missing module is not verified", out.record.status !== "verified" && out.comparison.missing.includes("b"), JSON.stringify(out));
  }

  {
    const { deps, calls } = makeDeps({ fetchRegistry: async () => [{ ...pkg, modules: [] }] });
    const out = await verifyPackage({ ...base, deps });
    check("zero modules fails", out.ok === false && out.errorCode === "failed" && /no modules/.test(out.error || ""), JSON.stringify(out));
    check("zero modules stores a failed row", calls.records.length === 1 && calls.records[0].status === "failed");
  }

  {
    let upgrade = 76;
    const { deps, calls } = makeDeps({ fetchRegistry: async () => [{ ...pkg, upgradeNumber: upgrade }] });
    await verifyPackage({ ...base, deps });
    upgrade = 77;
    await verifyPackage({ ...base, deps });
    check("each call stores the current upgrade", calls.records[0].upgradeNumber === 76 && calls.records[1].upgradeNumber === 77, JSON.stringify(calls.records.map((r) => r.upgradeNumber)));
  }

  {
    pkg.sourceDigest = digest;
    const { deps, calls } = makeDeps({
      compile: async () => ({ ok: false, error: "compiler rejected", modules: [], status: 503 }),
    });
    const out = await verifyPackage({ ...base, deps });
    check("compile failure is reported", out.ok === false && out.errorCode === "compile", JSON.stringify(out));
    check("compile failure keeps the upstream status", out.upstreamStatus === 503, JSON.stringify(out));
    check("compile failure stores a failed row and no bundle", calls.records.length === 1 && calls.records[0].status === "failed" && calls.bundles === 0);
  }

  report(state);
})();
