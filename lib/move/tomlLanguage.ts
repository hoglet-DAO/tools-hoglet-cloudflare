/**
 * TOML grammar for CodeMirror 6.
 * Provides syntax highlighting for Move.toml manifests.
 */

import { StreamLanguage, type StreamParser } from "@codemirror/language";
import { tags } from "@lezer/highlight";

interface TomlState {
  inString: boolean;
}

const parser: StreamParser<TomlState> = {
  startState: () => ({ inString: false }),

  tokenTable: {
    section: tags.heading,
    key: tags.propertyName,
  },

  token(stream) {
    if (stream.eatSpace()) return null;

    // Comments: # ...
    if (stream.match(/^#.*/)) {
      return "comment";
    }

    // Section headers: [package], [dependencies.SupraFramework], etc.
    if (stream.match(/^\[+[^\]\n]+\]+/)) {
      return "section";
    }

    // Double-quoted strings
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) {
      return "string";
    }

    // Single-quoted strings
    if (stream.match(/^'[^']*'/)) {
      return "string";
    }

    // Numbers & Hex addresses
    if (stream.match(/^0x[0-9a-fA-F_]+/)) {
      return "number";
    }
    if (stream.match(/^\d[\d_]*(\.[\d_]+)?/)) {
      return "number";
    }

    // Booleans
    if (stream.match(/^(true|false)\b/)) {
      return "bool";
    }

    // Keys before '=': e.g. name =, version =
    if (stream.match(/^[A-Za-z0-9_-]+(?=\s*=)/)) {
      return "key";
    }

    // Identifiers inside inline tables or values
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_-]*/)) {
      return "variableName";
    }

    // Equal sign and operators
    if (stream.match("=")) {
      return "operator";
    }

    // Punctuation: {, }, [, ], comma, dot
    if (stream.match(/^[{}[\],.]/)) {
      return "punctuation";
    }

    stream.next();
    return null;
  },
};

export const tomlStreamParser: StreamParser<TomlState> = parser;

export const tomlLanguage = StreamLanguage.define(parser);

