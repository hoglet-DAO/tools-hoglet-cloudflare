const path = require("path");
const zlib = require("zlib");
const { loadTs, makeChecker, report } = require("./load-module.cjs");

const { fetchRegistry, fetchModuleBytecode } = loadTs(path.join(__dirname, "..", "lib", "verify", "rpc.ts"));
const { check, state } = makeChecker();

const ADDRESS = "0x3045d27b5fada1e30897a741fb184e48ef0bff3717aea23918ebc1e5c7153083";
const MANIFEST = '[package]\nname = "amm"\n';
const SOURCE = "module 0x1::a {}\n";

function gz(text) {
  return "0x" + zlib.gzipSync(Buffer.from(text)).toString("hex");
}

const resources = [
  {
    type: "0x1::code::PackageRegistry",
    data: {
      packages: [
        {
          name: "amm",
          upgrade_number: "76",
          source_digest: "ABCDEF",
          manifest: gz(MANIFEST),
          modules: [
            { name: "a", source: gz(SOURCE), source_map: "0x" },
            { name: "b", source: "0x", source_map: "0x" },
          ],
          deps: [{ account: "0x1", package_name: "MoveStdlib" }],
          upgrade_policy: { policy: 1 },
        },
      ],
    },
  },
];

const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.includes("/resources")) {
    return new Response(JSON.stringify(resources), { status: 200 });
  }
  if (url.includes("/modules")) {
    if (url.includes("start=next")) {
      return new Response(JSON.stringify([{ bytecode: "0xCC", abi: { name: "c" } }]), { status: 200 });
    }
    return new Response(
      JSON.stringify([
        { bytecode: "0xAa", abi: { name: "a" } },
        { bytecode: "0xBb", abi: { name: "b" } },
      ]),
      { status: 200, headers: { "x-supra-cursor": "next" } }
    );
  }
  throw new Error("unexpected fetch: " + url);
};

(async () => {
  try {
    const packages = await fetchRegistry("mainnet", ADDRESS);
    check("finds the package", packages.length === 1 && packages[0].name === "amm", JSON.stringify(packages));
    check("decodes the manifest", packages[0].manifest === MANIFEST, packages[0].manifest);
    check("decodes a module source", packages[0].modules[0].source === SOURCE, packages[0].modules[0].source);
    check("empty source becomes null", packages[0].modules[1].source === null, packages[0].modules[1].source);
    check("upgrade number is numeric", packages[0].upgradeNumber === 76, packages[0].upgradeNumber);
    check("decodes deps", packages[0].deps[0].packageName === "MoveStdlib", JSON.stringify(packages[0].deps));

    const modules = await fetchModuleBytecode("mainnet", ADDRESS);
    check("reads both pages", Object.keys(modules).sort().join(",") === "a,b,c", JSON.stringify(modules));
    check("normalises hex", modules.a === "0xaa" && modules.c === "0xcc", JSON.stringify(modules));
  } finally {
    globalThis.fetch = realFetch;
  }
  report(state);
})();
