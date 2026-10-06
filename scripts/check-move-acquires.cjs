#!/usr/bin/env node
/**
 * Audits `acquires` annotations in a Move file.
 *
 * The Move compiler rejects an `acquires` entry that is never actually acquired: only
 * move_to / move_from / borrow_global / borrow_global_mut count. `exists<T>()` does NOT,
 * and a call to a local function propagates that function's own acquires list.
 *
 * Usage: node scripts/check-move-acquires.cjs <file.move>
 */
const fs = require("fs");

const file = process.argv[2];
const src = fs.readFileSync(file, "utf8");
const lines = src.split(/\r?\n/);

// Collect function bodies by brace matching.
const functions = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(/^\s{4}(?:public(?:\([^)]*\))?\s+)?(?:entry\s+)?fun\s+(\w+)\s*\(/);
  if (!m) continue;

  // The signature may span several lines; gather until we find `acquires` + `{`.
  let sig = line;
  let j = i;
  while (j < lines.length && !/\{/.test(sig)) {
    j++;
    if (j < lines.length) sig += " " + lines[j].trim();
  }
  const acqMatch = sig.match(/acquires\s+([^)]+?)\s*\{\s*$/);
  const declared = acqMatch
    ? acqMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // Body: from the opening brace to its match.
  let depth = 0;
  let started = false;
  const body = [];
  for (let k = j; k < lines.length; k++) {
    for (const ch of lines[k]) {
      if (ch === "{") {
        depth++;
        started = true;
      } else if (ch === "}") {
        depth--;
      }
    }
    if (started) body.push(lines[k]);
    if (started && depth === 0) {
      functions.push({ name: m[1], line: i + 1, declared, sig, body: body.join("\n"), end: k + 1 });
      break;
    }
  }
  i = j;
}

const ACQUIRE_OPS = [
  ["move_to", /move_to\s*(?:<[^>]*>)?\s*\(/g],
  ["move_from", /move_from\s*</g],
  ["borrow_global_mut", /borrow_global_mut\s*</g],
  ["borrow_global", /borrow_global\s*</g],
];

// Types acquired by same-module callees (propagate their acquires).
function calleeAcquires(name) {
  const f = functions.find((x) => x.name === name);
  return f ? f.declared : [];
}

/**
 * Effective acquires of a function, following the compiler's own rules:
 *   - direct: only `move_from` / `borrow_global` / `borrow_global_mut` count.
 *     `move_to` only writes and `exists<T>()` is not an acquire at all.
 *   - transitive: a caller must declare everything its callees acquire.
 *
 * The fix point is iterated because callee sets can grow as we walk the call graph.
 */
function effectiveAcquires() {
  const eff = new Map();
  for (const fn of functions) eff.set(fn.name, new Set());

  for (const fn of functions) {
    for (const type of fn.declared) {
      const bare = type.split("::").pop();
      if (
        new RegExp(`(?:move_from|borrow_global_mut|borrow_global)\\s*<\\s*${bare}\\s*>`).test(fn.body)
      ) {
        eff.get(fn.name).add(type);
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const fn of functions) {
      for (const other of functions) {
        if (other.name === fn.name) continue;
        if (!new RegExp(`(?<![A-Za-z0-9_])${other.name}\\s*\\(`).test(fn.body)) continue;
        for (const t of eff.get(other.name)) {
          if (!eff.get(fn.name).has(t)) {
            eff.get(fn.name).add(t);
            changed = true;
          }
        }
      }
    }
  }
  return eff;
}

// Structs carrying the #[event] attribute (required by Move 2 for event::emit).
const eventStructs = new Set(
  [...src.matchAll(/#\[event\]\s*(?:\/\/[^\n]*\n\s*)*struct\s+([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1])
);

const eff = effectiveAcquires();
let problems = 0;

for (const fn of functions) {
  const expected = eff.get(fn.name);
  const declared = new Set(fn.declared);

  // Move 2: `event::emit` only accepts a struct defined in this module with `#[event]`.
  const emittedTypes = [...fn.body.matchAll(/event::emit\(\s*([A-Za-z_][A-Za-z0-9_]*)/g)].map(
    (mm) => mm[1]
  );
  for (const t of new Set(emittedTypes)) {
    if (!eventStructs.has(t)) {
      problems++;
      console.log(
        `event::emit(${t}) in ${fn.name}() (line ${fn.line}): ${t} is missing the #[event] attribute`
      );
    }
  }

  // E07004: returning a reference that is still borrowed from global storage is rejected.
  const returnsRef = fn.sig.match(/\)\s*:\s*&[A-Za-z_][A-Za-z0-9_]*\s*(acquires[^)]*)?\{/);
  if (returnsRef && /borrow_global(_mut)?\s*</.test(fn.body)) {
    problems++;
    console.log(
      `E07004 ${fn.name}() (line ${fn.line}) returns a reference that is still borrowed from global storage`
    );
  }

  const extraneous = fn.declared.filter((d) => !expected.has(d));
  const missing = [...expected].filter((t) => !declared.has(t));

  if (extraneous.length || missing.length) {
    problems++;
    if (extraneous.length) {
      console.log(
        `E02002 extraneous acquires in ${fn.name}() (line ${fn.line}): ${extraneous.join(", ")}`
      );
    }
    if (missing.length) {
      console.log(
        `E04020 missing acquires in ${fn.name}() (line ${fn.line}): ${missing.join(", ")}`
      );
    }
  }
}

console.log(problems === 0 ? "\nacquires annotations consistent" : `\n${problems} function(s) need fixing`);