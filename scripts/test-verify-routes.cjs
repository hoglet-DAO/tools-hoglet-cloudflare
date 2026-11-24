/**
 * Route-level checks with a fake Cloudflare env, so they run without a Worker.
 *
 * Run: node scripts/test-verify-routes.cjs
 */
const path = require("path");
const { loadTs, makeChecker, report } = require("./load-module.cjs");
const { check, state } = makeChecker();

process.env.MOVE_COMPILE_TOKEN = process.env.MOVE_COMPILE_TOKEN || "test-token";

const ADDRESS = "0x3045d27b5fada1e30897a741fb184e48ef0bff3717aea23918ebc1e5c7153083";

const emptyFirst = { first: async () => null, all: async () => ({ results: [] }) };
const env = {
  MOVE_VERIFY_DB: {
    prepare: () => ({ bind: () => emptyFirst, first: emptyFirst.first, all: emptyFirst.all }),
  },
  MOVE_SOURCES: {
    list: async () => ({ objects: [] }),
    get: async () => null,
  },
};
const locals = { "@opennextjs/cloudflare": { getCloudflareContext: () => ({ env }) } };

const listRoute = loadTs(path.join(__dirname, "..", "app", "api", "verify", "[network]", "[address]", "route.ts"), locals);
const sourceRoute = loadTs(
  path.join(__dirname, "..", "app", "api", "verify", "[network]", "[address]", "[package]", "source", "route.ts"),
  locals
);
const bundleRoute = loadTs(path.join(__dirname, "..", "app", "api", "verify", "bundle", "[sha256]", "route.ts"), locals);
const healthRoute = loadTs(path.join(__dirname, "..", "app", "api", "verify", "health", "route.ts"), locals);
const postRoute = loadTs(path.join(__dirname, "..", "app", "api", "verify", "route.ts"), locals);

(async () => {
  const list = await listRoute.GET(new Request("http://x"), {
    params: Promise.resolve({ network: "mainnet", address: ADDRESS }),
  });
  const listBody = await list.json();
  check("list returns 200", list.status === 200, JSON.stringify(listBody));
  const names = (listBody.packages || []).map((p) => p.name);
  check("list includes amm and RazorLibs", names.includes("amm") && names.includes("RazorLibs"), JSON.stringify(names));

  const source = await sourceRoute.GET(new Request("http://x"), {
    params: Promise.resolve({ network: "mainnet", address: ADDRESS, package: "RazorLibs" }),
  });
  const sourceBody = await source.json();
  check("source returns chain files", source.status === 200 && sourceBody.origin === "chain", JSON.stringify(sourceBody).slice(0, 200));
  check("source has 26 modules", Object.keys(sourceBody.files || {}).length === 26, String(Object.keys(sourceBody.files || {}).length));

  const noEnvLocals = {
    "@opennextjs/cloudflare": {
      getCloudflareContext: () => {
        throw new Error("no env");
      },
    },
  };
  const listNoEnv = loadTs(
    path.join(__dirname, "..", "app", "api", "verify", "[network]", "[address]", "route.ts"),
    noEnvLocals
  );
  const noEnv = await listNoEnv.GET(new Request("http://x"), {
    params: Promise.resolve({ network: "mainnet", address: ADDRESS }),
  });
  check("list works without bindings", noEnv.status === 200, String(noEnv.status));

  const missing = await bundleRoute.GET(new Request("http://x"), {
    params: Promise.resolve({ sha256: "0".repeat(64) }),
  });
  check("unknown bundle is 404", missing.status === 404, String(missing.status));

  const fakeBundle = {
    version: 1,
    network: "mainnet",
    address: ADDRESS,
    package: "demo",
    upgradeNumber: 1,
    files: { "sources/a.move": "module 0x1::a {}" },
    manifest: '[package]\nname = "demo"',
    verification: {
      status: "verified",
      exactSource: true,
      sourceDigest: "A",
      computedDigest: "A",
      compilerVersion: "Supra CLI 0.5.0",
      frameworkRev: null,
      onchainModules: { a: "b" },
    },
  };
  const sha = "a".repeat(64);
  env.MOVE_SOURCES.get = async (key) =>
    key === `bundles/${sha}.json` ? { text: async () => JSON.stringify(fakeBundle) } : null;
  const zip = await bundleRoute.GET(new Request(`http://x/api/verify/bundle/${sha}?format=zip`), {
    params: Promise.resolve({ sha256: sha }),
  });
  const zipBytes = Buffer.from(await zip.arrayBuffer());
  check(
    "zip includes verify.json",
    zip.status === 200 &&
      (zip.headers.get("content-type") || "").includes("zip") &&
      zipBytes.includes("verify.json") &&
      zipBytes.includes("hoglet.move-verification.v1"),
    `${zip.status} ${zip.headers.get("content-type")}`
  );

  const health = await healthRoute.GET();
  const healthBody = await health.json();
  check("health reports all three", health.status === 200 && healthBody.compile && healthBody.d1 && healthBody.r2, JSON.stringify(healthBody));

  const { readFolderFiles } = loadTs(path.join(__dirname, "..", "components", "verify", "readFolder.ts"));
  const picked = await readFolderFiles({
    files: [
      { webkitRelativePath: "pkg/Move.toml", name: "Move.toml", text: async () => "[package]" },
      { webkitRelativePath: "pkg/tests/a.move", name: "a.move", text: async () => "test" },
      { webkitRelativePath: "pkg/sources/a.move", name: "a.move", text: async () => "module 0x1::a {}" },
    ],
  });
  check(
    "drops tests and the root manifest",
    "sources/a.move" in picked && !("tests/a.move" in picked) && !("Move.toml" in picked),
    JSON.stringify(Object.keys(picked))
  );

  const bad = await postRoute.POST(
    new Request("http://x", { method: "POST", body: JSON.stringify({ network: "nope" }) })
  );
  check("POST rejects a bad network", bad.status === 400, String(bad.status));

  const badFiles = await postRoute.POST(
    new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        network: "mainnet",
        address: ADDRESS,
        package: "amm",
        files: { "Move.toml": "" },
      }),
    })
  );
  check("POST rejects a root manifest", badFiles.status === 400, String(badFiles.status));

  report(state);
})();
