/**
 * Checks the multi-project store, which is what stops a creator from losing the label of an earlier
 * deployment.
 *
 * The bug this exists for: storage was keyed by the creator alone, so naming a second package overwrote the
 * first. The deployment stayed on-chain, but the browser kept only the last label — and the label is the
 * only local record of which package produced which Resource Account.
 *
 * `localStorage` does not exist in Node, and the store guards on that, so a shim is installed on `window`
 * before the module is loaded. Without it every write would report "unavailable" and every check would pass
 * against empty state.
 *
 * Run: node scripts/test-project-store.cjs
 */

const path = require("path");
const { loadTs, makeChecker, report } = require("./load-module.cjs");

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    _map: map,
  };
}

const storage = makeStorage();
globalThis.window = { localStorage: storage };

const proj = loadTs(path.join(__dirname, "..", "lib", "move", "project.ts"));

const { check, state } = makeChecker();

const CREATOR = "0xabc";
const OTHER = "0xdef";

const fresh = (id, name, updatedAt = 0) => ({
  id,
  name,
  address: "0xtarget",
  modules: [{ path: "sources/A.move", source: `module ${name}::a {}` }],
  tomlOverride: null,
  updatedAt,
});

console.log("ids and names:");
check("newProjectId is unique across calls", proj.newProjectId() !== proj.newProjectId());
check("nextProjectName starts at my_package", proj.nextProjectName([]) === "my_package");
check("nextProjectName skips a taken name", proj.nextProjectName(["my_package"]) === "my_package_2");
check(
  "nextProjectName is case-insensitive",
  proj.nextProjectName(["MY_PACKAGE", "my_package_2"]) === "my_package_3",
  proj.nextProjectName(["MY_PACKAGE", "my_package_2"])
);

console.log();
console.log("a creator can hold several projects:");
check("an unknown creator has none", proj.listProjects(CREATOR).length === 0);

proj.saveProject(CREATOR, fresh("id-a", "alpha"));
proj.saveProject(CREATOR, fresh("id-b", "beta"));
proj.saveProject(OTHER, fresh("id-c", "gamma"));

const list = proj.listProjects(CREATOR);
check("both of the creator's projects are listed", list.length === 2, JSON.stringify(list));
check("the other creator's project is not", !list.some((p) => p.id === "id-c"));
check("the most recent comes first", list[0].id === "id-b", JSON.stringify(list.map((p) => p.id)));

console.log();
console.log("each project round-trips on its own:");
const loadedA = proj.loadProject(CREATOR, "id-a");
check("the id is restored", loadedA && loadedA.id === "id-a");
check("the name is restored", loadedA && loadedA.name === "alpha", loadedA && loadedA.name);
check("the sources are restored", loadedA && loadedA.modules[0].source.includes("alpha::a"));

console.log();
console.log("renaming keeps the project, it does not orphan it:");
proj.saveProject(CREATOR, { ...fresh("id-a", "renamed"), updatedAt: 5 });
const afterRename = proj.listProjects(CREATOR);
check("the id is unchanged", afterRename.some((p) => p.id === "id-a"));
check("the index shows the new name",
  afterRename.find((p) => p.id === "id-a").name === "renamed",
  JSON.stringify(afterRename));
check("no duplicate entry was created for the old name",
  !afterRename.some((p) => p.name === "alpha"),
  JSON.stringify(afterRename.map((p) => p.name)));
check("the sources are still reachable under the same id",
  proj.loadProject(CREATOR, "id-a").modules.length === 1);

console.log();
console.log("deleting removes the project and its index entry:");
proj.deleteProject(CREATOR, "id-b");
const afterDelete = proj.listProjects(CREATOR);
check("it is gone from the index", !afterDelete.some((p) => p.id === "id-b"), JSON.stringify(afterDelete));
check("its payload is gone too", proj.loadProject(CREATOR, "id-b") === null);
check("the sibling is untouched", afterDelete.some((p) => p.id === "id-a"));

console.log();
console.log("the pre-multi-project layout is adopted, not lost:");
// Exactly the old shape: keyed by the creator, no id, and the only copy of the user's work.
storage.setItem(
  "hgl:move-project:0xlegacy",
  JSON.stringify({ name: "oldpkg", address: "0xold", modules: [{ path: "sources/A.move", source: "module oldpkg::a {}" }], updatedAt: 1 })
);
const adopted = proj.listProjects("0xlegacy");
check("one project is adopted", adopted.length === 1, JSON.stringify(adopted));
check("its name survives", adopted[0].name === "oldpkg", adopted[0] && adopted[0].name);
check("it has an id now", typeof adopted[0].id === "string" && adopted[0].id.length > 0);
check("its sources are readable under the new key",
  (proj.loadProject("0xlegacy", adopted[0].id) || {}).modules?.[0]?.source?.includes("oldpkg::a") === true);
check("the old key is cleared so it cannot be adopted twice", storage.getItem("hgl:move-project:0xlegacy") === null);
check("a second call returns the same project, not a new copy",
  proj.listProjects("0xlegacy")[0].id === adopted[0].id);

console.log();
console.log("the selector's keys are namespaced per creator:");
check("the index key is per creator", "hgl:move-projects:0xabc" in Object.fromEntries(storage._map));
check("the project key carries the id", "hgl:move-project:0xabc:id-a" in Object.fromEntries(storage._map));
check("creator keys are lowercased", proj.listProjects("0xABC").length === proj.listProjects("0xabc").length);

report(state);
