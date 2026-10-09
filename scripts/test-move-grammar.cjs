/**
 * Tests the hand-written Move grammar.
 *
 * The grammar is the one piece here with no upstream to lean on, and its failure mode is silent: a
 * mis-tokenised `x"deadbeef"` or a broken nested comment just renders the wrong colour, which nobody
 * reports as a bug. These cases pin the constructs that a generic C-like highlighter gets wrong.
 *
 * Run: node scripts/test-move-grammar.cjs
 */

const fs = require("fs");
const path = require("path");
const { loadTs } = require("./load-module.cjs");

// Use the exported parser, not the StreamLanguage wrapper: the wrapper's own `token` has a different
// call shape, so testing through it measured the wrapper instead of the grammar.
const parser = loadTs(path.join(__dirname, "..", "lib", "move", "moveLanguage.ts")).moveStreamParser;

/**
 * Stand-in for CodeMirror's StringStream.
 *
 * The `start` field is the part that matters and the part worth getting right: `current()` returns
 * `slice(start, pos)`, NOT `slice(0, pos)`. An earlier version of this mock used the latter, so every
 * `current()` returned the whole line prefix, every keyword lookup missed, and the suite reported nine
 * grammar failures that were really nine harness failures.
 */
function makeStream(line) {
  let pos = 0;
  let start = 0;
  return {
    get pos() {
      return pos;
    },
    eol: () => pos >= line.length,
    current: () => line.slice(start, pos),
    next: () => {
      if (pos >= line.length) return undefined;
      start = pos;
      return line[pos++];
    },
    eatSpace: () => {
      const m = /^\s+/.exec(line.slice(pos));
      if (!m) return false;
      pos += m[0].length;
      start = pos;
      return true;
    },
    skipToEnd: () => {
      start = line.length;
      pos = line.length;
    },
    match(pattern) {
      const rest = line.slice(pos);
      let matched = null;
      if (typeof pattern === "string") {
        if (rest.startsWith(pattern)) matched = pattern;
      } else {
        const m = pattern.exec(rest);
        if (m && m.index === 0) matched = m[0];
      }
      if (matched === null) return null;
      start = pos;
      pos += matched.length;
      return matched;
    },
  };
}

/** Tokenises one line, returning [text, token] pairs for non-null tokens. */
function tokenizeLine(line, state) {
  const stream = makeStream(line);
  const out = [];
  let guard = 0;
  while (!stream.eol() && guard++ < 5000) {
    const before = stream.pos;
    const token = parser.token(stream, state);
    const text = line.slice(before, stream.pos).trim();
    if (token && text) out.push([text, token]);
    if (stream.pos === before) stream.next();
  }
  return out;
}

const fresh = () => ({ inBlockComment: 0, expectAbilities: false });

let failed = 0;
function check(name, cond, detail) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + detail}`);
  if (!cond) failed++;
}

/** Finds the token reported for the first occurrence of `needle`. */
function tokenFor(line, needle, state) {
  const stream = makeStream(line);
  let guard = 0;
  while (!stream.eol() && guard++ < 5000) {
    const before = stream.pos;
    const t = parser.token(stream, state);
    const text = line.slice(before, stream.pos).trim();
    if (text.startsWith(needle)) return t;
    if (stream.pos === before) stream.next();
  }
  return null;
}

console.log("keywords and types:");
check("module -> keyword", tokenFor("module my::m {", "module", fresh()) === "keyword");
check("fun -> keyword", tokenFor("public fun f()", "fun", fresh()) === "keyword");
check("u64 -> typeName", tokenFor("fun f(): u64", "u64", fresh()) === "typeName");
check("capitalised name -> typeName", tokenFor("let x: Coin", "Coin", fresh()) === "typeName");
check("lowercase name -> variableName", tokenFor("let value = 1", "value", fresh()) === "variableName");
check("Self -> keyword", tokenFor("Self::f()", "Self", fresh()) === "keyword");

console.log();
console.log("literals that a C-like highlighter gets wrong:");
check('x".." -> string', tokenFor('let k = x"deadbeef";', 'x"', fresh()) === "string");
check('b".." -> string', tokenFor('let s = b"hello";', 'b"', fresh()) === "string");
check("bare x is still an identifier", tokenFor("let x = 1", "x", fresh()) === "variableName");
check("bare b is still an identifier", tokenFor("let b = 1", "b", fresh()) === "variableName");
check("@0x1 -> atom", tokenFor("let a = @0x1;", "@0x1", fresh()) === "atom");
check("number with suffix -> number", tokenFor("let n = 42u64;", "42", fresh()) === "number");
check("hex number -> number", tokenFor("let h = 0xCAFE;", "0xCAFE", fresh()) === "number");

console.log();
console.log("comments:");
check("/// -> docComment", tokenFor("/// docs", "///", fresh()) === "docComment");
check("// -> comment", tokenFor("// note", "//", fresh()) === "comment");
{
  const st = fresh();
  const t = parser.token(makeStream("/* outer"), st);
  check("/* opens a block comment", t === "comment" && st.inBlockComment === 1, `token=${t} depth=${st.inBlockComment}`);
  // Nested: depth must increase, and the closing lines must not be read as code.
  parser.token(makeStream("/* inner"), st);
  check("nested /* increases depth", st.inBlockComment === 2, `depth=${st.inBlockComment}`);
  parser.token(makeStream("*/"), st);
  parser.token(makeStream("*/"), st);
  check("matching */ closes the comment", st.inBlockComment === 0, `depth=${st.inBlockComment}`);
}

console.log();
console.log("attributes and abilities:");
/**
 * `annotation`, not `meta`, and the difference is visible.
 *
 * One Dark groups `tags.meta` with `tags.comment` under one colour, so an attribute tokenised as `meta`
 * rendered exactly like a comment. A Move attribute is the opposite of a comment: `#[view]` is what makes a
 * function callable as a view and `#[event]` is what declares an event. Verified in the theme source:
 * `{ tag: [tags.meta, tags.comment], color: stone }`.
 */
check("#[test] -> annotation", tokenFor("#[test]", "#[", fresh()) === "annotation",
  String(tokenFor("#[test]", "#[", fresh())));
check("#[view] is not tokenised as meta (meta shares the comment colour)",
  tokenFor("#[view]", "#[", fresh()) !== "meta", String(tokenFor("#[view]", "#[", fresh())));
check("#[event] -> annotation", tokenFor("#[event]", "#[", fresh()) === "annotation",
  String(tokenFor("#[event]", "#[", fresh())));
{
  const st = fresh();
  const has = tokenFor("struct C has key, store {", "has", st);
  const key = tokenFor("struct C has key, store {", "key", st);
  check("has -> keyword", has === "keyword", String(has));
  check("key after has -> keyword", key === "keyword", String(key));
}
{
  // `copy` is an ability in a has-clause and an operation elsewhere; the state must distinguish them.
  const stAfterHas = { inBlockComment: 0, expectAbilities: true };
  check("copy in has-clause -> keyword", tokenFor("has copy, drop", "copy", stAfterHas) === "keyword");
  check("copy outside has-clause -> keyword (language keyword)", tokenFor("copy x", "copy", fresh()) === "keyword");
}

console.log();
console.log("module paths:");
check(":: -> punctuation", tokenFor("std::vector::length", "::", fresh()) === "punctuation");

console.log();
console.log("a whole line tokenises without stalling:");
{
  const st = fresh();
  const line = 'module probe::m { use std::vector; const K: vector<u8> = x"00"; }';
  const toks = tokenizeLine(line, st);
  check("produced tokens", toks.length > 5, `got ${toks.length}`);
  check("module is keyword", toks[0][1] === "keyword", JSON.stringify(toks[0]));
  check("hex literal inside is a string", toks.some(([, t]) => t === "string"), JSON.stringify(toks));
}

console.log();
console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);