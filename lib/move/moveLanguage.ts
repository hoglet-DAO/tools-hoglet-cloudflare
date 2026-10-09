/**
 * Move grammar for CodeMirror 6.
 *
 * There is no `codemirror-lang-move` package. `highlightjs-move` exists but is a highlight.js grammar,
 * and the tree-sitter grammars need a WASM build toolchain; neither drops into CodeMirror. So this is a
 * `StreamParser`, which is the documented way to add a language without a Lezer parser.
 *
 * The token lists are taken from the language reference rather than guessed, which matters because Move
 * has several constructs a generic C-like highlighter gets wrong: `x"..."` and `b"..."` are literals but
 * `x` and `b` are also valid identifiers, `@0x1` is an address literal, `#[test]` is an attribute, and
 * `has copy, drop` uses contextual keywords that are not reserved elsewhere.
 */

import { StreamLanguage, type StreamParser } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/** Reserved in all positions. `has` is here rather than only in ABILITIES: it introduces the clause,
 * so without it the ability state never opens and `has copy, drop` renders as plain identifiers. */
const KEYWORDS = new Set([
  "module", "script", "address", "struct", "enum", "fun", "const", "use",
  "public", "entry", "native", "inline", "friend", "package",
  "if", "else", "while", "loop", "for", "in", "match", "break", "continue", "return", "abort",
  "let", "mut", "move", "copy", "as", "acquires", "where", "has",
]);

/** Only keywords inside a `struct ... has <abilities>` clause. */
const ABILITIES = new Set(["key", "store", "drop", "copy", "phantom"]);

/** Move Specification Language; highlighted so spec blocks do not look like an error. */
const SPEC = new Set([
  "spec", "schema", "pragma", "invariant", "ensures", "requires", "aborts_if", "aborts_with",
  "succeeds_if", "include", "assume", "assert", "modifies", "emits", "apply", "axiom",
  "forall", "exists", "choose", "old", "global", "with", "except", "decreases",
]);

/**
 * Names that read as types when capitalised. Not enforced: Move has no reserved type names, so this is
 * only a hint that makes `SignerCapability` look different from a local variable.
 */
const BUILTIN_TYPES = new Set([
  "u8", "u16", "u32", "u64", "u128", "u256",
  "bool", "address", "signer", "vector",
]);

interface State {
  inBlockComment: number;
  /** True after a `has` keyword, until the ability list ends. */
  expectAbilities: boolean;
}

const parser: StreamParser<State> = {
  startState: () => ({ inBlockComment: 0, expectAbilities: false }),

  /**
   * Maps the token names this grammar returns onto CodeMirror highlight tags.
   *
   * Two entries exist because the defaults are wrong for this language, not for tidiness:
   *
   *  - `annotation` replaces `meta` for `#[...]`. One Dark groups `tags.meta` with `tags.comment` under a
   *    single colour, so attributes rendered exactly like comments — and a Move attribute is not a comment:
   *    `#[view]` is what makes a function callable as a view, `#[event]` is what declares an event.
   *
   *  - `docComment` is not in the built-in table at all, so without this entry `///` would fall through to
   *    no tag and render in the default text colour, indistinguishable from code.
   */
  tokenTable: {
    docComment: tags.docComment,
    annotation: tags.annotation,
  },

  token(stream, state) {
    // Block comments nest in Move, so they are tracked by depth rather than a boolean.
    if (state.inBlockComment > 0) {
      if (stream.match("/*")) state.inBlockComment++;
      else if (stream.match("*/")) state.inBlockComment--;
      else stream.next();
      return "comment";
    }

    if (stream.eatSpace()) return null;

    // Doc comments are highlighted like the reference tooling does, so `///` reads as documentation.
    if (stream.match("///")) {
      stream.skipToEnd();
      return "docComment";
    }
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match("/*")) {
      state.inBlockComment = 1;
      return "comment";
    }

    // Attributes: #[test], #[view], #[event], #[resource_group_member(...)]
    if (stream.match("#[")) {
      let depth = 1;
      while (!stream.eol() && depth > 0) {
        const ch = stream.next();
        if (ch === "[") depth++;
        else if (ch === "]") depth--;
      }
      return "annotation";
    }

    // Byte and hex literals. Checked before identifiers so the leading `b`/`x` is not read as a name,
    // while `b` alone still tokenises as an identifier below.
    if (stream.match(/^b"/)) {
      stream.match(/[^"]*"/);
      return "string";
    }
    if (stream.match(/^x"/)) {
      stream.match(/[0-9a-fA-F]*"/);
      return "string";
    }

    // Address literals: @0x1, @named_address
    if (stream.match(/^@[0-9a-zA-Z_]+/)) return "atom";

    if (stream.match(/^0x[0-9a-fA-F_]+/)) return "number";
    if (stream.match(/^\d[\d_]*(\.[\d_]+)?/)) {
      stream.match(/^(u8|u16|u32|u64|u128|u256|i8|i16|i32|i64|i128|i256)\b/);
      return "number";
    }

    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";

    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      const word = stream.current();

      if (KEYWORDS.has(word)) {
        state.expectAbilities = word === "has";
        return "keyword";
      }
      if (state.expectAbilities) {
        // The clause ends at the first name that is not an ability, which is also where the state clears.
        if (ABILITIES.has(word)) return "keyword";
        state.expectAbilities = false;
      }
      if (SPEC.has(word)) return "keyword";
      if (BUILTIN_TYPES.has(word)) return "typeName";
      // Checked before the capitalisation heuristic: `Self` is capitalised, so the generic rule would
      // otherwise claim it and render it as an ordinary type.
      if (word === "Self") return "keyword";
      if (/^[A-Z]/.test(word)) return "typeName";
      return "variableName";
    }

    // `::` is how Move addresses modules; treat it as punctuation, not an operator, so it does not
    // visually merge a path into an expression.
    if (stream.match("::")) return "punctuation";
    if (stream.match(/^[+\-*/%=<>!&|^~?:]+/)) return "operator";
    if (stream.match(/^[{}()[\];,.]/)) return "punctuation";

    stream.next();
    return null;
  },
};

/**
 * Exported for tests.
 *
 * CodeMirror wraps this in a StreamLanguage whose own `token` has a different call shape, so testing
 * through the wrapped object measured the wrapper rather than the grammar.
 */
export const moveStreamParser: StreamParser<State> = parser;

export const moveLanguage = StreamLanguage.define(parser);