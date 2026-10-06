const fs = require("fs");
const path = require("path");

const MESSAGES = path.join(__dirname, "..", "messages");
const LOCALES = ["ar", "de", "en", "es", "fr", "ha", "hi", "id", "ja", "ko", "pt", "ru", "zh"];
const NS = "Governance";

// Keys referenced by the governance UI. Scan every component in the folder, since the lifecycle
// runner lives in its own file.
const SRC_DIR = path.join(__dirname, "..", "components", "governance");
const sources = fs
  .readdirSync(SRC_DIR)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => fs.readFileSync(path.join(SRC_DIR, f), "utf8"));
const src = sources.join("\n");

const used = new Set();
// Require a boundary before `t(` so calls like `connect("starkey")` are not mistaken for `t("...")`.
for (const m of src.matchAll(/(?<![A-Za-z0-9_])t\(\s*"([a-zA-Z0-9_]+)"/g)) used.add(m[1]);
for (const m of src.matchAll(/key:\s*"([a-zA-Z0-9_]+)"/g)) used.add(m[1]);
// Lookup maps such as STAGE_KEY keep their strings as values, not as t("...") arguments.
for (const m of src.matchAll(/^\s*[a-zA-Z0-9_]+:\s*"(stage_[a-zA-Z0-9_]+)"/gm)) used.add(m[1]);

// The dynamic action keys are referenced through the LIFECYCLE_ACTIONS table.
const actionKeys = [...src.matchAll(/key:\s*"(action[A-Za-z0-9_]*)"/g)].map((m) => m[1]);

const ref = JSON.parse(fs.readFileSync(path.join(MESSAGES, "en.json"), "utf8"))[NS];

const missingInEn = [...used].filter((k) => !(k in ref));
if (missingInEn.length) {
  console.log(`MISSING in en.json: ${missingInEn.join(", ")}`);
}

const unusedInEn = Object.keys(ref).filter((k) => !used.has(k));
if (unusedInEn.length) {
  console.log(`unused in en.json: ${unusedInEn.join(", ")}`);
}

let bad = 0;
for (const loc of LOCALES) {
  const ns = JSON.parse(fs.readFileSync(path.join(MESSAGES, `${loc}.json`), "utf8"))[NS];
  const missing = [...used].filter((k) => !(k in ns));
  const extra = Object.keys(ns).filter((k) => !(k in ref));
  if (missing.length || extra.length) {
    bad++;
    console.log(`${loc}: missing=[${missing.join(", ")}] extra=[${extra.join(", ")}]`);
  }
}

console.log(`\nkeys used by UI: ${used.size} (incl. ${actionKeys.length} action keys)`);
console.log(bad === 0 ? "all 13 locales complete and consistent" : `${bad} locale(s) inconsistent`);
process.exit(missingInEn.length || bad ? 1 : 0);