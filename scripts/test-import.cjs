/**
 * Verifies importing a package from picked files.
 *
 * Two ways to hand over a package have to work: selecting a folder (which supplies relative paths and is
 * the only way to learn the internal layout) and a flat multi-select of a manifest plus some sources.
 * The failure modes that matter are a partial import that looks complete and a path that survives import
 * but not compilation, so those are what these cases pin.
 *
 * Run: node scripts/test-import.cjs
 */

const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const { loadTs } = require("./load-module.cjs");

const proj = loadTs(path.join(__dirname, "..", "lib", "move", "project.ts"));

let failed = 0;
const check = (n, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + d}`);
  if (!c) failed++;
};

const ADDR = "0x5c46920705e1f48375cca7d95313f3e80f70e5497ed21ef3a01be91142e60b75";
const TOML = `[package]\nname = "imported"\nversion = "0.0.1"\n\n[addresses]\nimported = "${ADDR}"\n\n[dependencies.SupraFramework]\ngit = "${proj.FRAMEWORK_GIT}"\nrev = "${proj.FRAMEWORK_REV}"\nsubdir = "${proj.FRAMEWORK_SUBDIR}"\n`;

console.log("folder selection (relative paths supplied):");
const folder = proj.projectFromFiles([
  { name: "Move.toml", relativePath: "my-pkg/Move.toml", content: TOML },
  { name: "Pool.move", relativePath: "my-pkg/sources/Pool.move", content: "module imported::Pool {}" },
  { name: "Deep.move", relativePath: "my-pkg/sources/nested/Deep.move", content: "module imported::Deep {}" },
  { name: "README.md", relativePath: "my-pkg/README.md", content: "# hi" },
]);
check("imports", folder.ok === true, folder.error);
check("takes the package name from the manifest", folder.project?.name === "imported", folder.project?.name);
check("keeps the manifest as an override", folder.project?.tomlOverride === TOML, "not preserved");
check("places a top-level source under sources/",
  folder.project?.modules.some((m) => m.path === "sources/Pool.move"),
  JSON.stringify(folder.project?.modules.map((m) => m.path)));
check("preserves a nested layout",
  folder.project?.modules.some((m) => m.path === "sources/nested/Deep.move"),
  JSON.stringify(folder.project?.modules.map((m) => m.path)));
check("ignores non-Move files", folder.project?.modules.length === 2,
  JSON.stringify(folder.project?.modules.map((m) => m.path)));
check("sorts the modules", folder.project?.modules[0].path === "sources/nested/Deep.move",
  JSON.stringify(folder.project?.modules.map((m) => m.path)));

console.log();
console.log("flat multi-select (no relative paths):");
const flat = proj.projectFromFiles([
  { name: "Move.toml", content: TOML },
  { name: "Pool.move", content: "module imported::Pool {}" },
  { name: "Token.move", content: "module imported::Token {}" },
]);
check("imports", flat.ok === true, flat.error);
check("both sources land under sources/",
  flat.project?.modules.map((m) => m.path).join() === "sources/Pool.move,sources/Token.move",
  JSON.stringify(flat.project?.modules.map((m) => m.path)));

console.log();
console.log("failures are reported, not silently half-applied:");
check("no files", proj.projectFromFiles([]).ok === false);
check("no Move.toml", proj.projectFromFiles([{ name: "Pool.move", content: "x" }]).ok === false);
check("the missing manifest is named",
  /Move\.toml/.test(proj.projectFromFiles([{ name: "Pool.move", content: "x" }]).error || ""),
  proj.projectFromFiles([{ name: "Pool.move", content: "x" }]).error);
check("no sources", proj.projectFromFiles([{ name: "Move.toml", content: TOML }]).ok === false);
check("a manifest without a package name",
  proj.projectFromFiles([
    { name: "Move.toml", content: "[addresses]\nx = \"0x1\"\n" },
    { name: "a.move", content: "module x::a {}" },
  ]).ok === false);

console.log();
console.log("a manifest is found regardless of how the path is spelled:");
check("nested manifest path", proj.projectFromFiles([
  { name: "Move.toml", relativePath: "deep/pkg/Move.toml", content: TOML },
  { name: "a.move", relativePath: "deep/pkg/sources/a.move", content: "module imported::a {}" },
]).ok === true);

console.log();
console.log("the shallowest manifest wins when a folder carries more than one:");
// A vendored dependency or a nested example brings its own Move.toml. `find` took whichever the browser
// happened to list first, which is not a stable order — the same folder could import as either package.
const nestedToml = `[package]
name = "vendored"
version = "0.0.1"

[addresses]
vendored = "0x1"
`;
const multi = proj.projectFromFiles([
  { name: "Move.toml", relativePath: "pkg/deps/Vendor/Move.toml", content: nestedToml },
  { name: "Move.toml", relativePath: "pkg/Move.toml", content: TOML },
  { name: "a.move", relativePath: "pkg/sources/a.move", content: "module imported::a {}" },
]);
check("imports", multi.ok === true, multi.error);
check("takes the package, not the vendored manifest", multi.project?.name === "imported", multi.project?.name);
check("and keeps that manifest as the override", multi.project?.tomlOverride === TOML, "wrong manifest kept");

console.log();
console.log("a package can be imported in pieces:");
// People move a package around as a bare `sources/` tree or a handful of files. Requiring the manifest made
// the import useless for exactly the case it is most reached for, so the workspace's own name stands in.
const partial = proj.projectFromFiles(
  [{ name: "example.move", relativePath: "sources/example.move", content: "module mine::example {}" }],
  "mine"
);
check("imports without a manifest", partial.ok === true, partial.error);
check("takes the fallback name", partial.project?.name === "mine", partial.project?.name);
check("generates the manifest instead of overriding it",
  partial.project?.tomlOverride === null, String(partial.project?.tomlOverride));
check("the source lands under sources/",
  partial.project?.modules[0]?.path === "sources/example.move", partial.project?.modules[0]?.path);
check("still refuses when there is no name to fall back on",
  proj.projectFromFiles([{ name: "example.move", content: "module mine::example {}" }]).ok === false);

console.log();
console.log("two same-named sources in different folders no longer collide:");
// They used to be flattened to `sources/Pool.move` and one was reported as skipped. Keeping the path
// relative to the package root means both survive, which is the point of normalising rather than flattening.
const dupe = proj.projectFromFiles([
  { name: "Move.toml", relativePath: "pkg/Move.toml", content: TOML },
  { name: "Pool.move", relativePath: "pkg/sources/Pool.move", content: "module imported::Pool {}" },
  { name: "Pool.move", relativePath: "pkg/other/Pool.move", content: "module imported::Other {}" },
]);
check("imports both", dupe.ok === true, dupe.error);
check("each keeps its own path",
  (dupe.project?.modules || []).map((m) => m.path).sort().join() ===
    ["sources/Pool.move", "sources/other/Pool.move"].sort().join(),
  JSON.stringify(dupe.project?.modules.map((m) => m.path)));
check("nothing is reported as skipped", !dupe.skipped, JSON.stringify(dupe.skipped));

console.log();
console.log("a genuine collision is still reported:");
// Two flat picks cannot be told apart: both are just `Pool.move`, so one path is all they can share.
const flatDupe = proj.projectFromFiles([
  { name: "Move.toml", content: TOML },
  { name: "Pool.move", content: "module imported::A {}" },
  { name: "Pool.move", content: "module imported::B {}" },
]);
check("one of them is skipped", (flatDupe.skipped || []).length === 1, JSON.stringify(flatDupe.skipped));
check("only one reaches the tree",
  flatDupe.project?.modules.filter((m) => m.path === "sources/Pool.move").length === 1,
  JSON.stringify(flatDupe.project?.modules.map((m) => m.path)));

console.log();
console.log("the package root is the manifest's directory:");
// Picking a parent folder used to mix every package under it, because each source was matched by the
// `sources/` in its own path and nothing said which package it belonged to.
const parent = proj.projectFromFiles([
  { name: "Move.toml", relativePath: "projects/mine/Move.toml", content: TOML },
  { name: "a.move", relativePath: "projects/mine/sources/a.move", content: "module imported::a {}" },
  { name: "Move.toml", relativePath: "projects/theirs/Move.toml", content: TOML },
  { name: "b.move", relativePath: "projects/theirs/sources/b.move", content: "module imported::b {}" },
]);
check("imports the shallowest package", parent.ok === true, parent.error);
check("takes only that package's sources",
  parent.project?.modules.map((m) => m.path).join() === "sources/a.move",
  JSON.stringify(parent.project?.modules.map((m) => m.path)));
check("a sibling package is not reported as a broken file", !parent.skipped, JSON.stringify(parent.skipped));

console.log();
console.log("sources are normalised into sources/, keeping their shape:");
// The layout the compiler reads is `sources/`, whatever the package happened to look like on disk.
const shape = proj.projectFromFiles([
  { name: "Move.toml", relativePath: "pkg/Move.toml", content: TOML },
  { name: "Pool.move", relativePath: "pkg/sources/utils/Pool.move", content: "module imported::Pool {}" },
  { name: "Mod.move", relativePath: "pkg/modules/Mod.move", content: "module imported::Mod {}" },
  { name: "Deep.move", relativePath: "pkg/a/b/c/Deep.move", content: "module imported::Deep {}" },
  { name: "Loose.move", relativePath: "pkg/Loose.move", content: "module imported::Loose {}" },
]);
check("a sources/ subfolder is preserved",
  shape.project?.modules.some((m) => m.path === "sources/utils/Pool.move"),
  JSON.stringify(shape.project?.modules.map((m) => m.path)));
check("a non-sources folder is kept under sources/",
  shape.project?.modules.some((m) => m.path === "sources/modules/Mod.move"),
  JSON.stringify(shape.project?.modules.map((m) => m.path)));
check("deep nesting survives",
  shape.project?.modules.some((m) => m.path === "sources/a/b/c/Deep.move"),
  JSON.stringify(shape.project?.modules.map((m) => m.path)));
check("a loose file lands directly under sources/",
  shape.project?.modules.some((m) => m.path === "sources/Loose.move"),
  JSON.stringify(shape.project?.modules.map((m) => m.path)));
check("everything is under sources/",
  (shape.project?.modules || []).every((m) => m.path.startsWith("sources/")),
  JSON.stringify(shape.project?.modules.map((m) => m.path)));

console.log();
console.log("the standard is enforced, not assumed:");
// A package may legitimately contain a `tests/` directory, but this workspace only ever compiles what is
// under `sources/`. A file imported from elsewhere is moved there rather than kept where the compiler
// would ignore it — and rather than silently dropped.
const stray = proj.projectFromFiles([
  { name: "Move.toml", relativePath: "pkg/Move.toml", content: TOML },
  { name: "case.move", relativePath: "pkg/tests/case.move", content: "module imported::case {}" },
  { name: "loose.move", relativePath: "pkg/loose.move", content: "module imported::loose {}" },
]);
check("a file from tests/ is moved under sources/",
  stray.project?.modules.some((m) => m.path === "sources/tests/case.move"),
  JSON.stringify(stray.project?.modules.map((m) => m.path)));
check("a file at the package root is moved under sources/",
  stray.project?.modules.some((m) => m.path === "sources/loose.move"),
  JSON.stringify(stray.project?.modules.map((m) => m.path)));
check("nothing lands outside sources/",
  (stray.project?.modules || []).every((m) => m.path.startsWith("sources/")),
  JSON.stringify(stray.project?.modules.map((m) => m.path)));

// One manifest per project, and an import is what supplies it: the imported text becomes the override,
// which is the only Move.toml the compiler is given.
check("the imported manifest replaces the current one",
  stray.project?.tomlOverride === TOML, String(stray.project?.tomlOverride).slice(0, 40));
check("exactly one manifest is exported back",
  proj.projectToExportFiles(stray.project).filter((f) => f.path === "Move.toml").length === 1,
  JSON.stringify(proj.projectToExportFiles(stray.project).map((f) => f.path)));

console.log();
console.log("an imported project exports back to the same paths:");
const files = proj.projectToExportFiles(folder.project);
check("Move.toml is first", files[0].path === "Move.toml", files[0].path);
check("the manifest round-trips", files[0].content === TOML, files[0].content.slice(0, 60));
check("sources round-trip", files.length === 3, JSON.stringify(files.map((f) => f.path)));

console.log();
console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);