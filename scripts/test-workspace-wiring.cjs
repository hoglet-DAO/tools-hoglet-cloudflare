/**
 * Guards two wiring invariants that a render test would cover but that are cheap to check statically.
 *
 * The first is the bug that blocked deploying: the workspace called `onArtifacts(null)` on every edit and
 * on every compile, which wiped the bytecode the user had uploaded by hand. Since the compile service
 * returns module IDs rather than bytecode, the workspace supplies nothing — so it must never clear the
 * parent's state, and the call has to go through the ownership guard.
 *
 * The second is that a disabled deploy button must say what is missing. Three independent requirements
 * gate it, so "it will not let me deploy" was the only conclusion available.
 *
 * These read the source rather than rendering, which is weaker than a real test: they catch the specific
 * regression, not the behaviour in general. A render harness would be the stronger option if this grows.
 *
 * Run: node scripts/test-workspace-wiring.cjs
 */

const fs = require("fs");
const path = require("path");

/**
 * Strips comments before any check.
 *
 * The first version searched the raw source, so a comment that merely *mentioned* `onArtifacts(null)` and
 * one that named the removed compile command both counted as live code. Three checks failed against prose
 * that was documenting the very fixes they were verifying.
 */
function stripComments(src) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/^\s*\/\/.*$/gm, ""); // line comments
}

const govDir = path.join(__dirname, "..", "components", "governance");
const readFiles = (...names) => names.map((n) => fs.readFileSync(path.join(govDir, n), "utf8")).join("\n");
const readDir = (sub) =>
  fs
    .readdirSync(path.join(govDir, sub))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => fs.readFileSync(path.join(govDir, sub, f), "utf8"))
    .join("\n");

// The workspace and the runner were each split into a folder of parts; the checks span the whole set.
const workspace = stripComments([readFiles("MoveWorkspace.tsx", "MoveEditor.tsx"), readDir("workspace")].join("\n"));
const runner = stripComments([readFiles("LifecycleRunner.tsx"), readDir("lifecycle")].join("\n"));

let failed = 0;
const check = (n, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + d}`);
  if (!c) failed++;
};

console.log("the workspace does not clear artifacts it did not supply:");
const rawCalls = workspace.match(/onArtifacts\(null\)/g) || [];
check("exactly one raw onArtifacts(null) call exists", rawCalls.length === 1, `found ${rawCalls.length}`);

const guardIdx = workspace.indexOf("const invalidateOwnArtifacts");
const callIdx = workspace.indexOf("onArtifacts(null)");
check("the only raw call is inside the guard", guardIdx >= 0 && callIdx > guardIdx,
  `guard at ${guardIdx}, call at ${callIdx}`);

check("the guard checks ownership before clearing",
  /invalidateOwnArtifacts[\s\S]{0,200}suppliedArtifacts\.current[\s\S]{0,80}onArtifacts\(null\)/.test(workspace),
  "no suppliedArtifacts check found");

check("every invalidation site goes through the guard",
  (workspace.match(/invalidateOwnArtifacts\(\);/g) || []).length >= 8,
  `${(workspace.match(/invalidateOwnArtifacts\(\);/g) || []).length} guarded calls`);

check("compiling invalidates through the guard, not directly",
  /handleCompile[\s\S]*?invalidateOwnArtifacts\(\)/.test(workspace),
  "handleCompile does not use the guard");

console.log();
console.log("the disabled deploy button explains itself:");
check("Form accepts a reason", /reason\?: string;/.test(runner), "no reason prop");
check("Form renders the reason when not ready",
  /\{!ready && reason && \(/.test(runner),
  "no conditional render");
check("the deploy form computes a reason",
  /const notReadyReason =/.test(runner),
  "notReadyReason not computed");
// A taken target is no longer a reason the form cannot proceed — it is a mode. The same name resolves to the
// same address, so the form switches its action to an upgrade instead of sending the user to another screen.
check("a taken target switches the action to an upgrade",
  /if \(targetTaken\) \{[\s\S]{0,180}run\("upgrade_contract"/.test(runner),
  "targetTaken does not route to the upgrade");
check("the CTA reflects the mode",
  /cta=\{targetTaken \? t\("upgradeFormCta"\) : t\("deployFormCta"\)\}/.test(runner),
  "the CTA does not change for a taken target");
check("it names the admin first when deploying",
  /notReadyReason =\s*!targetTaken && !immutable && !adminOk[\s\S]{0,60}t\("deployNeedAdmin"\)/.test(runner),
  "admin not named first");
check("it names the metadata next",
  /!isUsableHex\(metadata\)[\s\S]{0,40}t\("deployNeedMetadata"\)/.test(runner),
  "metadata not named");
check("it names the bytecode last",
  /modules\.length === 0[\s\S]{0,40}t\("deployNeedBytecode"\)/.test(runner),
  "bytecode not named");
check("the reason is passed to the form",
  /reason=\{notReadyReason\}/.test(runner),
  "reason not passed");
check("the bytecode message says where the bytes come from",
  /bytecode_modules/.test(
    JSON.parse(fs.readFileSync(path.join(__dirname, "..", "messages", "en.json"), "utf8")).Governance
      .deployNeedBytecode
  ),
  "does not mention bytecode_modules/");

console.log();
console.log("the deploy form checks the target, not the wallet:");
// The audit runs against the connected wallet, but the deploy goes to an account derived from it. Without
// a check on the target itself, a creator who had already deployed kept being offered a deploy that could
// only abort on E_ALREADY_INITIALIZED.
check("the target's managed state is tracked",
  /const \[targetTaken, setTargetTaken\] = useState/.test(runner),
  "no targetTaken state");
check("it reads is_factory_managed for the target",
  /isFactoryManaged\(rpcUrl, target\)/.test(runner),
  "is_factory_managed not called for the target");
check("a taken target is ready to upgrade, not blocked",
  /isUsableHex\(metadata\) && modules\.length > 0 && \(targetTaken \|\| immutable \|\| adminOk\)/.test(runner),
  "ready does not account for targetTaken");
// The guard only reacted to a change of target, so a deploy that succeeded left the form offering the very
// same deploy again — the target had not changed, so nothing re-ran, and the next press could only abort on
// E_ALREADY_INITIALIZED.
check("the guard re-checks after a transaction ends",
  /if \(isPending\) return;/.test(runner) &&
    /\[rpcUrl, target, isFactoryManaged, isPending, deployedTarget\]/.test(runner),
  "the guard does not re-run when a transaction ends");
check("a successful deploy records its target",
  /if \(txHash\) setDeployedTarget\(target\)/.test(runner),
  "success does not record the target");
check("a lagging read cannot un-take it",
  /setTargetTaken\(taken \|\| target === deployedTarget\)/.test(runner),
  "a stale read can re-enable the deploy");
check("the vault's own guard is explained to the user",
  /E_ALREADY_INITIALIZED/.test(
    fs.readFileSync(path.join(__dirname, "..", "utils", "supra", "errors.ts"), "utf8")
  ),
  "E_ALREADY_INITIALIZED not translated");

console.log();
console.log("the target is derived in the workspace, where the label lives:");
// The address is a function of `(creator, label)`, and the label (the seed, or the package name when no seed
// is set) is edited in the workspace. The deploy form cannot see it, so it must not compute the target — it
// takes what the workspace reports.
check("the workspace derives it from (creator, label)",
  /predictResourceAccount\(rpcUrl, creator, label\)/.test(workspace),
  "workspace does not derive the target");
check("the workspace reports it to the parent",
  /onTarget\(/.test(workspace) && /setTarget\(/.test(workspace),
  "workspace does not report the target");
check("the workspace keys storage by creator, not by address",
  /const key = useMemo\(\(\) => \(creator \|\| "unbound"\)/.test(workspace),
  "storage key still falls back to the address");

console.log();
console.log("several projects per creator, so no label is lost:");
// Storage keyed by the creator alone held one package, so naming a second silently dropped the first label —
// which is the only local record of which package produced which Resource Account.
check("the workspace lists the creator's projects",
  /listProjects\(key\)/.test(workspace),
  "workspace does not list projects");
check("it tracks which one is open",
  /const \[activeId, setActiveId\]/.test(workspace),
  "no active project id");
check("it loads by id, not by creator alone",
  /loadProject\(key, activeId\)/.test(workspace),
  "load is not scoped to a project");
check("it saves under that id",
  /saveProject\(key, \{\s*id: activeId/.test(workspace),
  "autosave does not carry the id");
check("it can add a project", /const addProject = useCallback/.test(workspace), "no add");
check("it can delete one", /deleteProject\(key, activeId\)/.test(workspace), "no delete");
check("a new project's name avoids the labels already in use",
  /nextProjectName\(/.test(workspace),
  "new names are not deduplicated");
// An unusable name blanks the target, and that is exactly when the user needs to switch away from a
// project — so the selector has to render in the unresolved branch too, not only in the normal one.
const targetGuardIdx = workspace.indexOf("if (!target)");
check("the selector stays reachable when the target cannot be resolved",
  targetGuardIdx >= 0 && workspace.slice(targetGuardIdx, targetGuardIdx + 400).includes("{projectBar}"),
  "the selector is behind the target guard");

check("the deploy form no longer predicts",
  !/predictResourceAccount/.test(runner),
  "deploy form still predicts the target");
check("the deploy form takes the target from the workspace",
  /onTarget=\{setTarget\}/.test(runner),
  "deploy form does not take onTarget");

console.log();
console.log("the deploy sends the label the address is derived from:");
// The contract takes `(label, metadata, code, admin)`. Sending three arguments made every deploy abort with
// "Argument count mismatch: expected 4, got 3" before any of it ran — and the label is not decoration, it is
// the input the Resource Account is derived from.
check("the four arguments are in the contract's order",
  /\[\s*labelToHex\(label\),\s*metadata,\s*modules\.map\(\(m\) => m\.hex\),[\s\S]{0,220}admin\.trim\(\),?\s*\]/.test(runner),
  "argument list changed");
check("the deploy form takes the label from the workspace",
  /onLabel=\{setLabel\}/.test(runner),
  "deploy form does not take the label");
check("the workspace reports the label when it is usable",
  /onLabel\?\.\(labelOk \? label : ""\)/.test(workspace),
  "workspace does not report the label");
check("the label is not gated on the address prediction",
  workspace.indexOf("onLabel(labelOk") < workspace.indexOf("predictResourceAccount(rpcUrl, creator, label)"),
  "the label is only reported after the prediction");
check("prediction and deploy share one encoder",
  /labelToHex/.test(
    fs.readFileSync(
      path.join(__dirname, "..", "hooks", "features", "governance", "useGovernanceAudit.ts"),
      "utf8"
    )
  ),
  "the prediction does not use the shared encoder");

console.log();
console.log("importing a folder is not at the mercy of the picker:");
// `accept` combined with `webkitdirectory` makes Chromium return an empty selection in some versions, which
// reads as "import did nothing" — and does so intermittently, by browser and version. The filtering it was
// doing already happens in code, so the attribute only ever risked the picker.
check("the folder picker does not carry accept",
  !/webkitdirectory[\s\S]{0,200}accept=/.test(workspace),
  "accept is still on the folder input");
check("one import button, not two",
  /t\("workspaceImport"\)/.test(workspace) && !/workspaceImportFiles/.test(workspace),
  "the removed second button is back");
check("an empty folder pick falls through to the plain picker",
  /onImport\(e\.target\.files, "folder"\)/.test(workspace) &&
    /fileInput\.current\?\.click\(\)/.test(workspace),
  "the fallback is not wired");
check("the import falls back to the workspace's own name",
  /projectFromFiles\(files, name\)/.test(workspace),
  "no fallback name passed");
check("an empty selection is reported rather than swallowed",
  /setError\(t\("workspaceImportEmpty"\)\)/.test(workspace),
  "an empty selection still returns silently");

console.log();
console.log("a cached compile says so instead of reporting 0 ms:");
const browser = fs.readFileSync(path.join(__dirname, "..", "lib", "move", "compileBrowser.ts"), "utf8");
check("the result carries a `cached` flag", /cached: boolean;/.test(browser), "no cached flag");
check("a hit sets it", /cached: true/.test(browser), "hit does not set cached");
check("a miss clears it", /cached: false/.test(browser), "miss does not clear cached");
check("the UI distinguishes the two",
  /workspaceCompiledCached/.test(workspace),
  "UI does not distinguish cached");

console.log();
console.log("the obsolete local-compile command is gone:");
check("no supra move compile command remains", !/supra move compile/.test(runner), "still present");
check("no compileCmd variable remains", !/compileCmd/.test(runner), "still present");

console.log();
console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);