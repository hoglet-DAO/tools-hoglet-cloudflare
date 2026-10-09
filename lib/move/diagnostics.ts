/**
 * Reading the Move compiler's output.
 *
 * Kept out of the editor component on purpose: parsing diagnostics has nothing to do with rendering, and
 * living in a `.tsx` file meant it could only be tested by transpiling JSX and stubbing React and
 * CodeMirror — for a pure string function.
 */

/**
 * Strips ANSI escapes from compiler output.
 *
 * The compile service returns the toolchain's raw stderr, which is colourised. Dropped straight into the
 * DOM those codes are invisible escape sequences that corrupt layout, and inside a `<pre>` they stop the
 * text from wrapping.
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code?: string;
  path: string;
  line: number;
  column: number;
  message: string;
  /**
   * True when the file is not part of the user's package.
   *
   * The framework compiles from source too, and its own sources live at
   * `<cache>/aptos-move/framework/supra-framework/sources/*.move`. Normalising a path to its last
   * `sources/` segment made those indistinguishable from the user's files, so `block.move` and
   * `supra_governance.move` were listed as though they were part of the project.
   */
  external: boolean;
}

/** `error[E01001]: invalid character` / `warning[W09001]: unused alias` */
const HEADER_RE = /^(error|warning)\[([A-Z]\d+)\]:\s*(.+)$/gm;
/** The caret line the toolchain prints under the header: `┌─ <path>:<line>:<col>` */
const LOCATION_RE = /[┌├│]\s*─?\s*([\w./\\-]*sources[\\/][\w.-]+\.move):(\d+):(\d+)/;

/**
 * Reads the compiler's diagnostics out of its output.
 *
 * Structured by header rather than by location, because the header is what carries the severity and the
 * message. A location-only match made every warning identical to every error, and left the owning file to
 * be guessed from the path alone.
 *
 * `ownPaths` is the set of module paths in the project. Anything outside it is the framework's own source
 * and is flagged `external` rather than dropped: hiding it would also hide a framework error caused by the
 * user's code, and those matter.
 */
export function parseDiagnostics(output: string, ownPaths: string[] = []): Diagnostic[] {
  const clean = stripAnsi(output);
  const known = new Set(ownPaths.map((p) => p.replace(/\\/g, "/")));
  const out: Diagnostic[] = [];

  const headers: { index: number; severity: DiagnosticSeverity; code: string; message: string }[] = [];
  let h: RegExpExecArray | null;
  HEADER_RE.lastIndex = 0;
  while ((h = HEADER_RE.exec(clean))) {
    headers.push({
      index: h.index,
      severity: h[1] as DiagnosticSeverity,
      code: h[2],
      message: h[3].trim(),
    });
  }

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    // Only the text between this header and the next belongs to it; a location further down would
    // otherwise be attributed to the wrong diagnostic.
    const end = i + 1 < headers.length ? headers[i + 1].index : clean.length;
    const block = clean.slice(header.index, end);
    const loc = block.match(LOCATION_RE);
    if (!loc) continue;

    const rawPath = loc[1].replace(/\\/g, "/");
    const path = rawPath.replace(/^.*?(sources\/)/, "$1");
    out.push({
      severity: header.severity,
      code: header.code,
      path,
      line: Number(loc[2]),
      column: Number(loc[3]),
      message: header.message.slice(0, 220),
      external: !known.has(path),
    });
  }

  return out;
}

export interface TestSummary {
  ran: boolean;
  ok: boolean;
  total: number;
  passed: number;
  failed: number;
}

/**
 * Reads the test runner's summary out of its stdout.
 *
 * The toolchain prints a line like `Test result: FAILED. Total tests: 4; passed: 3; failed: 1`. The exit
 * code is not enough on its own: a suite with failing tests still exits zero often enough that a caller
 * trusting it would show a green badge for red tests.
 */
export function summarizeTests(stdout: string): TestSummary {
  const clean = stripAnsi(stdout);
  const result = clean.match(/Test result:\s*(OK|FAILED)/i);
  if (!result) return { ran: false, ok: false, total: 0, passed: 0, failed: 0 };

  const num = (label: string) => {
    const m = clean.match(new RegExp(`${label}\\s*:?\\s*(\\d+)`, "i"));
    return m ? Number(m[1]) : 0;
  };

  const total = num("Total tests");
  const passed = num("passed");
  const failed = num("failed");

  return {
    ran: true,
    // The verdict word decides, and the counts corroborate when they are present. The summary format has
    // changed across toolchain versions while the word has not, so the word is what to trust.
    ok: /OK/i.test(result[1]) && failed === 0,
    total,
    passed,
    failed,
  };
}