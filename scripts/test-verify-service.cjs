const path = require("path");
const { loadTs, makeChecker, report } = require("./load-module.cjs");

const { verifyPackage } = loadTs(path.join(__dirname, "..", "lib", "verify", "service.ts"));
const { sourceDigest } = loadTs(path.join(__dirname, "..", "lib", "verify", "digest.ts"));
const { check, state } = makeChecker();

const MANIFEST = '[package]\nname = "demo"\nversion = "1.0.0"\n\n[addresses]\ndemo = "0x1"\n';
const SOURCE = "module 0x1::a {}\n";
const UPLOAD = { "sources/a.move": SOURCE };

function makeDeps(overrides = {}) {
  const calls = { compile: 0, bundles: [], records: [], files: null, opts: null, version: 0 };
  const deps = {
    fetchRegistry: async () => [pkg],
    fetchModuleBytecode: async () => ({ a: "0xaa" }),
    compile: async (files, _token, opts) => {
      calls.compile++;
      calls.files = files;
      calls.opts = opts;
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
    fetchVersion: async () => {
      calls.version++;
      return null;
    },
    getVerification: async () => null,
    putVerification: async (_env, record) => calls.records.push(record),
    putBundle: async (_env, bundle) => {
      calls.bundles.push(bundle);
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
    check("bundle stored", calls.bundles.length === 1);
    check("record stored", calls.records.length === 1 && calls.records[0].status === "verified");
    check("compile received the manifest and sources", calls.files["Move.toml"].includes('name = "demo"') && calls.files["sources/a.move"] === SOURCE, JSON.stringify(calls.files));
    check("compile asks for the verify lane", calls.opts?.purpose === "verify", JSON.stringify(calls.opts));
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
    check("unreproduced stores the bundle", calls.bundles.length === 1);
  }

  {
    pkg.sourceDigest = "00";
    const { deps, calls } = makeDeps({ fetchModuleBytecode: async () => ({ a: "0xff" }) });
    const out = await verifyPackage({ ...base, deps });
    check("neither is failed", out.ok === false && out.record.status === "failed" && out.errorCode === "failed", JSON.stringify(out));
    check("failed stores no bundle", calls.bundles.length === 0);
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
    const B = "module 0x1::b {}\n";
    const { deps } = makeDeps({
      fetchRegistry: async () => [{ ...pkg, modules: [{ name: "a", source: SOURCE }, { name: "b", source: B }] }],
      fetchModuleBytecode: async () => ({ a: "0xaa", b: "0xbb" }),
    });
    const out = await verifyPackage({ ...base, deps });
    check("missing module is not verified", out.record.status !== "verified" && out.comparison.missing.includes("b"), JSON.stringify(out));
    check("missing module error names it", (out.record.error || "").includes("b"), out.record.error);
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
      compile: async () => ({ ok: false, error: "compiler rejected", stderr: "line 3: boom", modules: [], status: 503 }),
    });
    const out = await verifyPackage({ ...base, deps });
    check("exact source + compile failure is unreproduced", out.ok === true && out.record.status === "unreproduced", JSON.stringify(out.record));
    check("the compiler detail is kept", (out.record.error || "").includes("boom"), out.record.error);
    check("the unreproduced bundle is stored", calls.bundles.length === 1);

    pkg.sourceDigest = "00";
    const failedDeps = makeDeps({ compile: async () => ({ ok: false, error: "compiler rejected", modules: [] }) });
    const failed = await verifyPackage({ ...base, deps: failedDeps.deps });
    check("non-exact + compile failure is failed", failed.ok === false && failed.record.status === "failed", JSON.stringify(failed.record));
    pkg.sourceDigest = digest;
  }

  {
    const B = "module 0x1::b {}\n";
    const { deps } = makeDeps({
      fetchRegistry: async () => [{ ...pkg, modules: [{ name: "a", source: SOURCE }, { name: "b", source: B }] }],
      fetchModuleBytecode: async () => ({ a: "0xaa", b: "0xbb", c: "0xcc" }),
      compile: async () => ({ ok: true, code: 0, modules: ["0x1::a", "0x1::b"], bytecode: ["0xaa", "0xbb"], metadata: null, artifactsOmitted: false, ms: 1, stdout: "", stderr: "" }),
    });
    const out = await verifyPackage({ ...base, files: { "sources/a.move": SOURCE, "sources/b.move": B }, deps });
    check("ignores modules from other packages at the address", out.record.status === "verified", JSON.stringify(out.record));
  }

  {
    const files = {
      "sources/a.move": SOURCE,
      "deps/RazorLibs/Move.toml": '[package]\nname = "RazorLibs"\n',
      "deps/RazorLibs/sources/x.move": "module 0x1::x {}\n",
    };
    const { deps, calls } = makeDeps();
    const out = await verifyPackage({ ...base, files, deps });
    check("bundle keeps dependency inputs", out.ok && calls.bundles[0].files["deps/RazorLibs/sources/x.move"] === files["deps/RazorLibs/sources/x.move"], JSON.stringify(Object.keys(calls.bundles[0]?.files || {})));
  }

  {
    const files = {
      "sources/a.move": SOURCE,
      "deps/RazorLibs/Move.toml": '[package]\nname = "RazorLibs"\n[dependencies.X]\nlocal = "/etc"\n',
    };
    const { deps, calls } = makeDeps();
    const out = await verifyPackage({ ...base, files, deps });
    check("rejects an unsafe dependency manifest", out.ok === false && /local|dependency manifest/i.test(out.error || ""), JSON.stringify(out));
    check("does not compile an unsafe dependency manifest", calls.compile === 0);
  }

  {
    const { deps, calls } = makeDeps({
      fetchVersion: async () => {
        calls.version++;
        return { compilerVersion: "supra 0.5.0", frameworkCommit: "f".repeat(40) };
      },
    });
    const out = await verifyPackage({ ...base, deps });
    check("records the version from GET /version", out.record.compilerVersion === "supra 0.5.0", out.record.compilerVersion);
    check("calls the version endpoint once", calls.version === 1, String(calls.version));
  }

  {
    const { deps, calls } = makeDeps({
      compile: async () => ({ ok: true, code: 0, modules: ["0x1::a"], bytecode: ["0xaa"], metadata: null, artifactsOmitted: false, ms: 1, stdout: "", stderr: "", compilerVersion: "from-compile" }),
      fetchVersion: async () => {
        calls.version++;
        return { compilerVersion: "from-endpoint", frameworkCommit: null };
      },
    });
    const out = await verifyPackage({ ...base, deps });
    check("prefers the compile response version", out.record.compilerVersion === "from-compile" && calls.version === 0, `${out.record.compilerVersion}/${calls.version}`);
  }

  {
    const manifest = '[package]\nname = "demo"\n\n[dependencies.RazorLibs]\ngit = "https://github.com/example/razor.git"\nrev = "main"\n';
    const R = { ...pkg, manifest, sourceDigest: "00" };
    const { deps, calls } = makeDeps({ fetchRegistry: async () => [R] });
    const out = await verifyPackage({
      ...base,
      files: {
        "sources/a.move": SOURCE,
        "deps/RazorLibs/Move.toml": '[package]\nname = "RazorLibs"\n',
        "deps/RazorLibs/sources/x.move": "module 0x1::x {}\n",
      },
      deps,
    });
    check(
      "service bundles a provided git dep",
      out.ok && calls.files["Move.toml"].includes('local = "deps/RazorLibs"') && !calls.files["Move.toml"].includes("example/razor"),
      calls.files["Move.toml"]
    );
  }

  report(state);
})();
