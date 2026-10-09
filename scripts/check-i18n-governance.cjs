const fs = require("fs");
const path = require("path");

const MESSAGES = path.join(__dirname, "..", "messages");
const LOCALES = ["ar", "de", "en", "es", "fr", "ha", "hi", "id", "ja", "ko", "pt", "ru", "zh"];
const NS = "Governance";

// Keys referenced by the governance UI. Walk the folder recursively: the lifecycle runner and the
// workspace were each split into their own subfolders, and those hold most of the strings.
const SRC_DIR = path.join(__dirname, "..", "components", "governance");
function readSources(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readSources(full));
    // `.ts` too: `STATUS_META` moved out of the component into `statusMeta.ts`, and its `key:` fields
    // are looked up dynamically through `t(meta.key)`.
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) out.push(fs.readFileSync(full, "utf8"));
  }
  return out;
}
const src = readSources(SRC_DIR).join("\n");

const used = new Set();
// Require a boundary before `t(` so calls like `connect("starkey")` are not mistaken for `t("...")`.
for (const m of src.matchAll(/(?<![A-Za-z0-9_])t\(\s*"([a-zA-Z0-9_]+)"/g)) used.add(m[1]);
for (const m of src.matchAll(/key:\s*"([a-zA-Z0-9_]+)"/g)) used.add(m[1]);
// Lookup maps such as STAGE_KEY keep their strings as values, not as t("...") arguments.
for (const m of src.matchAll(/^\s*[a-zA-Z0-9_]+:\s*"(stage_[a-zA-Z0-9_]+)"/gm)) used.add(m[1]);
// Glossary entries pass their key in a `termKey` field, so next-intl receives a variable rather
// than a literal. They are real runtime dependencies and must be counted as used.
for (const m of src.matchAll(/termKey:\s*"([a-zA-Z0-9_]+)"/g)) used.add(m[1]);

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