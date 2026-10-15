/**
 * Guards the AI prompt the workspace copies.
 *
 * A prompt that omits the address, or that pronounces the framework pin wrongly, sends the model back with a
 * package that compiles and then fails on-chain — the exact failure this button exists to avoid. These
 * checks assert the prompt carries the four things the model cannot invent: the package name, the address it
 * must be published to, the framework pin, and the layout.
 *
 * Run: node scripts/test-ai-prompt.cjs
 */

const path = require("path");
const { loadTs, makeChecker, report } = require("./load-module.cjs");

const { buildContractGuide } = loadTs(path.join(__dirname, "..", "lib", "move", "aiPrompt.ts"));

const NAME = "my_package";
const ADDR = "0x4f0ecd9bf5f4d2247bd8f30161729e9cf606233a88976d0a1ce5a99bd1f6f87e";
const guide = buildContractGuide(NAME, ADDR);

const { check, state } = makeChecker();

console.log("the AI prompt carries what the model cannot invent:");
check("it names the package", guide.includes(`**${NAME}**`), "package name absent");
check("it carries the publish address", guide.includes(ADDR), "target address absent");
check("it pins the framework to the same git, rev and subdir",
  guide.includes('git = "https://github.com/Entropy-Foundation/aptos-core.git"')
    && guide.includes('rev = "dev"')
    && guide.includes('subdir = "aptos-move/framework/supra-framework"'),
  "the framework pin is wrong or incomplete");
check("it puts the named address key equal to the package name",
  new RegExp(`\\[addresses\\]\\s*\\n${NAME} = "${ADDR}"`).test(guide),
  "the [addresses] line does not bind the package name to the target");

console.log();
console.log("it states the hard limits:");
check("it gives the package-name rule",
  /\^\[A-Za-z_\]\[A-Za-z0-9_\]\{0,38\}\$/.test(guide), "no package-name rule");
check("it puts every module under sources/",
  guide.includes("sources/") && guide.includes("The compiler only reads that directory"),
  "the layout is not stated");
check("it warns about upgrade compatibility",
  /compatible/.test(guide) && /do not change/.test(guide), "no upgrade rules");
check("it says out loud that there is no chunked publish",
  /no chunked publish on Supra/.test(guide), "the chunked-publish constraint is missing");

report(state);
