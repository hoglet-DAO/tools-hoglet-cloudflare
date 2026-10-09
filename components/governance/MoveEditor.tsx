"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import { moveLanguage } from "@/lib/move/moveLanguage";

/**
 * Move source editor.
 *
 * CodeMirror 6 with a hand-written Move grammar, because no `codemirror-lang-move` exists and the
 * highlight.js and tree-sitter options do not fit this runtime. See `lib/move/moveLanguage.ts`.
 *
 * Everything that differs between "a textarea" and "an editor" comes from here and not from the tree:
 * syntax colouring, bracket matching, search, undo history, and correct indentation on Enter. That is
 * why the previous textarea was worth replacing even though it technically accepted input.
 */

/**
 * The two tags One Dark gets wrong for Move.
 *
 * Applied after One Dark so these win for their own tags without disturbing the rest of its palette.
 *
 * `annotation` is bolded and given a warmer, stronger colour than the group it shares with `number` and
 * `typeName`: a Move attribute is the most consequential token on the line — it decides whether a function
 * is callable as a view at all — so it should not read as one item among many.
 *
 * `docComment` is absent from One Dark entirely. Without a rule it renders in the default text colour,
 * which makes `///` look like code rather than documentation.
 */
const moveHighlightStyle = HighlightStyle.define([
  { tag: tags.annotation, color: "#e5c07b", fontWeight: "600" },
  { tag: tags.docComment, color: "#7f8796", fontStyle: "italic" },
]);

/**
 * App-matched dark theme.
 *
 * Set `dark: true` and applied through the editor's own extension rather than a preset. The wrapper is
 * told `theme="none"` because `@uiw/react-codemirror` otherwise injects its light theme onto a
 * `cm-theme-light` container, which painted a white surface under an otherwise dark editor.
 */
const theme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#0a0a0a",
      color: "#e5e7eb",
      fontSize: "12px",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily:
        "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      lineHeight: "1.45",
      backgroundColor: "#0a0a0a",
    },
    ".cm-content": {
      padding: "10px 0",
      caretColor: "#6ee7b7",
      backgroundColor: "transparent",
    },
    ".cm-line": { padding: "0 8px" },
    "&.cm-focused": { outline: "none" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "rgba(16,185,129,0.22)",
    },
    ".cm-gutters": {
      backgroundColor: "#070707",
      borderRight: "1px solid rgba(255,255,255,0.08)",
      color: "#4b5563",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.03)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(255,255,255,0.05)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#6ee7b7" },
    ".cm-selectionMatch": { backgroundColor: "rgba(110,231,183,0.15)" },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: "rgba(16,185,129,0.28)",
      outline: "1px solid rgba(16,185,129,0.5)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "rgba(255,255,255,0.1)",
      border: "none",
      color: "#9ca3af",
    },
    ".cm-tooltip": {
      backgroundColor: "#111",
      border: "1px solid rgba(255,255,255,0.15)",
      color: "#e5e7eb",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "rgba(16,185,129,0.2)",
    },
  },
  { dark: true }
);

export function MoveEditor({
  value,
  onChange,
  path,
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  /** Used as the aria label so several editors in the tree are distinguishable. */
  path: string;
  className?: string;
}) {
  /**
   * One Dark's syntax colours on this editor's own dark surface.
   *
   * `basicSetup` installs a default highlight style tuned for LIGHT backgrounds, so on a near-black
   * editor it painted keywords and identifiers in colours close to the background — technically styled,
   * effectively unreadable. Using an established palette rather than inventing one also means the
   * contrast ratios are already solved: One Dark's keyword, string and number colours are chosen to sit
   * on a dark editor, so they hold up on `#0a0a0a` as well as on their native `#282c34`.
   *
   * Only the highlight style is taken. The full `oneDark` theme would repaint the background to its own
   * grey, which would no longer match the rest of the app.
   */
  const extensions = useMemo(
    () => [moveLanguage, syntaxHighlighting(oneDarkHighlightStyle), syntaxHighlighting(moveHighlightStyle), theme],
    []
  );

  return (
    <div className={`min-h-0 flex-1 overflow-hidden bg-[#0a0a0a] ${className}`} data-editor-path={path}>
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme="none"
        height="100%"
        style={{ height: "100%", backgroundColor: "#0a0a0a" }}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          searchKeymap: true,
          indentOnInput: true,
          tabSize: 4,
          // basicSetup installs its own highlight style tuned for light editors. Left on, it competes
          // with One Dark for the same tags, so the default palette is turned off and the only style
          // applied is the one declared in `extensions`.
          syntaxHighlighting: false,
        }}
        aria-label={path}
      />
    </div>
  );
}
