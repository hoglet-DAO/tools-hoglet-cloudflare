/**
 * Proves the digest algorithm against mainnet data, with no compiler.
 *
 * Run: node scripts/verify-mainnet-digest.cjs
 */
const path = require("path");
const zlib = require("zlib");
const { loadTs, makeChecker, report } = require("./load-module.cjs");

const { sourceDigest } = loadTs(path.join(__dirname, "..", "lib", "verify", "digest.ts"));
const { check, state } = makeChecker();

const ADDRESS = "0x3045d27b5fada1e30897a741fb184e48ef0bff3717aea23918ebc1e5c7153083";
const EXPECTED = "555FBD6AFEE8300521A8586799FC4CE005BFF548AC0F71E11D309249E7D764C9";

function decode(hex) {
  if (!hex || hex === "0x") return "";
  return zlib.gunzipSync(Buffer.from(hex.replace(/^0x/, ""), "hex")).toString("utf8");
}

(async () => {
  const res = await fetch(`https://rpc-mainnet.supra.com/rpc/v3/accounts/${ADDRESS}/resources`);
  const resources = await res.json();
  const registry = resources.find((r) => r.type === "0x1::code::PackageRegistry");
  const pkg = registry?.data?.packages?.find((p) => p.name === "RazorLibs");
  check("RazorLibs is on chain", !!pkg, "missing");
  if (!pkg) return report(state);

  const files = {};
  for (const mod of pkg.modules) {
    files[`sources/${mod.name}.move`] = decode(mod.source);
  }
  const digest = await sourceDigest(decode(pkg.manifest), files);
  check("digest matches the on-chain source_digest", digest === EXPECTED, digest);
  check("the chain agrees", pkg.source_digest === EXPECTED, pkg.source_digest);
  report(state);
})();
