const path = require("path");
const { loadTs, makeChecker, report } = require("./load-module.cjs");

const { compareModuleBytecode, classify } = loadTs(
  path.join(__dirname, "..", "lib", "verify", "compare.ts")
);
const { check, state } = makeChecker();

const compiled = (ids, hex) => ({ modules: ids, bytecode: hex });

console.log("compareModuleBytecode:");
const same = compareModuleBytecode(compiled(["0x1::a"], ["0xABcd"]), { a: "0xabcd" });
check("handles case and the 0x prefix", same.ok === true, JSON.stringify(same));

const diff = compareModuleBytecode(compiled(["0x1::a"], ["0xabcd"]), { a: "0xabce" });
check("detects a changed byte", diff.ok === false, JSON.stringify(diff));
check("reports the byte offset", diff.modules[0].firstDiff === 1, JSON.stringify(diff.modules));

const missing = compareModuleBytecode(compiled(["0x1::a"], ["0xaa"]), { a: "0xaa", b: "0xbb" });
check("reports a missing module", missing.ok === false && missing.missing.includes("b"), JSON.stringify(missing));

const extra = compareModuleBytecode(compiled(["0x1::a", "0x1::b"], ["0xaa", "0xbb"]), { a: "0xaa" });
check("reports an extra module", extra.ok === false && extra.extra.includes("b"), JSON.stringify(extra));

const empty = compareModuleBytecode(compiled(["0x1::a"], ["0xaa"]), {});
check("empty chain map is not a match", empty.ok === false, JSON.stringify(empty));

const withFriend = compareModuleBytecode(compiled(["0x1::a::friend"], ["0xaa"]), { a: "0xaa" });
check("reads the module name from an id with friends", withFriend.ok === true, JSON.stringify(withFriend));

console.log();
console.log("classify:");
check("digest + bytecode", JSON.stringify(classify(true, true)) === JSON.stringify({ status: "verified", exactSource: true }));
check("bytecode only", JSON.stringify(classify(false, true)) === JSON.stringify({ status: "verified", exactSource: false }));
check("digest only", JSON.stringify(classify(true, false)) === JSON.stringify({ status: "unreproduced", exactSource: true }));
check("neither", JSON.stringify(classify(false, false)) === JSON.stringify({ status: "failed", exactSource: false }));

report(state);
