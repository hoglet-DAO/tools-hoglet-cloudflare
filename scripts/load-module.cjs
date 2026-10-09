/**
 * Shared module loader for the test scripts.
 *
 * These scripts run the app's TypeScript directly, with no bundler, so two things have to be handled that
 * a bundler normally would: transpiling TS, and resolving the `@/` path alias. The alias was added here
 * after `lib/move/project.ts` started importing `@/lib/storage` — without it, every test that touched the
 * project model broke at require time with a message about a missing module rather than a failing check.
 *
 * `locals` lets a caller substitute a module it does not want loaded for real, which is how the browser
 * client is tested against a mocked fetch.
 */

const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const ROOT = path.join(__dirname, "..");
const ts = require(path.join(ROOT, "node_modules", "typescript"));

/** Resolves `@/foo` to `<root>/foo.ts|tsx|js`, which is what the tsconfig alias means. */
function resolveAlias(spec) {
  if (!spec.startsWith("@/")) return null;
  const base = path.join(ROOT, spec.slice(2));
  for (const ext of [".ts", ".tsx", ".js"]) {
    if (fs.existsSync(base + ext)) return base + ext;
    const indexFile = path.join(base, "index" + ext);
    if (fs.existsSync(indexFile)) return indexFile;
  }
  return null;
}

/**
 * Loads a TS module as CommonJS.
 *
 * `locals` is consulted first, then the alias, then Node's own resolution anchored at the file being
 * loaded — so a relative import inside the module resolves against that module, not against this script.
 */
function loadTs(file, locals = {}) {
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const js = ts.transpileModule(fs.readFileSync(abs, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const mod = { exports: {} };
  const base = createRequire(abs);
  const req = (spec) => {
    if (spec in locals) return locals[spec];
    const aliased = resolveAlias(spec);
    if (aliased) return loadTs(aliased, locals);
    return base(spec);
  };

  new Function("module", "exports", "require", "process", js)(mod, mod.exports, req, process);
  return mod.exports;
}

/** Reads `.env` into a plain object, so tests use the same values the app does. */
function readEnv() {
  return Object.fromEntries(
    fs
      .readFileSync(path.join(ROOT, ".env"), "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

/** A counter and reporter shared by the suites, so each script does not reinvent one. */
function makeChecker() {
  const state = { failed: 0 };
  const check = (name, cond, detail) => {
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + detail}`);
    if (!cond) state.failed++;
  };
  return { check, state };
}

function report(state) {
  console.log();
  console.log(state.failed === 0 ? "all checks passed" : `${state.failed} check(s) failed`);
  process.exit(state.failed === 0 ? 0 : 1);
}

module.exports = { loadTs, readEnv, makeChecker, report, ROOT };