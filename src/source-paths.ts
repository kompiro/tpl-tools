// Checks the source paths a TPL body names in inline code spans against the
// working tree (#17).
//
// `validate` reads frontmatter only, so a `## 関連テスト` section citing a
// deleted spec passes forever. In karasu 7 of 129 TPLs named a path that was
// not in the tree, and two had never existed at all.
//
// The check is opt-in: with no source prefixes configured nothing here runs,
// because the prefixes are what make the scan safe (see `candidatePath`).

import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Declares that the next line names a path which is *meant* not to exist —
 * history ("this spec was deleted"), an illustration, or a file a design
 * intends to create. A declaration of what the line claims, not a switch that
 * turns the check off: the reason is required, and a declaration standing over
 * paths that all resolve is itself a finding, so it cannot outlive its claim.
 *
 * The spelling matches karasu's downstream guard so a record keeps its meaning
 * when it moves between repos.
 */
export const ABSENT_PATH_MARKER = "absent-path-next-line";

/**
 * Path segments naming build output. A clean checkout does not have them, so
 * their absence is the normal state rather than a rotted reference. Only the
 * universal ones are listed; a repo-specific directory that is missing here
 * costs a false *negative* (one uncaught dead path), never a false positive,
 * so the fixed list stays on the safe side.
 */
export const GENERATED_SEGMENTS = new Set(["build", "coverage", "dist", "node_modules", "out"]);

export type SourcePathFindingKind =
  /** A code span names a source path that is not in the working tree. */
  | "body-source-path-missing"
  /** A marker sits above a line whose paths all resolve — the declaration is stale. */
  | "absent-path-marker-unused"
  /** A marker declares nothing about why the path is absent. */
  | "absent-path-marker-empty-reason";

export interface SourcePathFinding {
  kind: SourcePathFindingKind;
  /** 1-based line in the document. */
  line: number;
  /** The offending path; empty for the marker findings, which are about a line. */
  path: string;
}

/** The marker must be the whole line, indentation aside. Matching it mid-sentence
 * would make any document that *describes* the syntax declare something. */
const MARKER_RE = new RegExp(`^\\s*<!--\\s*${ABSENT_PATH_MARKER}\\s*:([^]*?)-->\\s*$`);

/** A run of backticks, which opens or closes an inline code span. */
const BACKTICK_RUN_RE = /`+/g;

/**
 * A fence opener or closer: three or more backticks or tildes, indented up to
 * three spaces. Both the character and the run length matter — a ```` fence
 * wrapping a ``` example closes only on four or more backticks, and a ~~~
 * fence does not close a ``` one.
 */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * One block-quote marker. A fence inside a quote is still a fence, so the
 * markers come off before a line is read as one.
 */
const QUOTE_MARKER_RE = /^ {0,3}> ?/;

/** One path segment. No separator, so a span is split before this is applied. */
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

/**
 * The path a span names, or `undefined` when the span is not a source path.
 *
 * Requiring the *whole* span to be a path is what keeps globs (`at-*.spec.ts`),
 * placeholders (`<spec path>`) and shell lines (`cp a b`) out without a
 * deny-list of illustrative names.
 *
 * Matching is by segment, never by string prefix: `packages-old/foo` does not
 * belong to the prefix `packages`. A trailing slash is accepted and dropped —
 * records legitimately name directories (95 such citations in karasu), so a
 * path resolves when it exists as either a file or a directory.
 */
export function candidatePath(span: string, prefixes: ReadonlySet<string>): string | undefined {
  // Backslashes are not accepted: records are committed Markdown and write
  // repo-relative paths with `/`. Treating `\` as a separator would also make
  // `C:\x` and escape sequences look like paths.
  if (span.includes("\\")) return undefined;
  const trimmed = span.endsWith("/") ? span.slice(0, -1) : span;
  const segments = trimmed.split("/");
  // A bare prefix (`packages`) names the root itself rather than a record's
  // subject, so at least one segment below it is required.
  if (segments.length < 2) return undefined;
  if (!segments.every((s) => SEGMENT_RE.test(s))) return undefined;
  // `.` and `..` pass SEGMENT_RE. Rejecting them keeps every candidate a
  // straightforward repo-relative path, so resolution cannot escape the root.
  if (segments.some((s) => s === "." || s === "..")) return undefined;
  if (!prefixes.has(segments[0])) return undefined;
  if (segments.some((s) => GENERATED_SEGMENTS.has(s))) return undefined;
  return trimmed;
}

interface CodeSpan {
  /** The span's content, padding stripped. */
  content: string;
  /** Offset of the content in the text the span was found in. */
  index: number;
}

/**
 * Every inline code span in a run of text, by CommonMark's rule: a run of n
 * backticks is closed by the next run of exactly n, and a run with no such
 * partner is literal text that the scan continues past.
 *
 * The run length matters to this check in both directions. A record writes a
 * path holding a backtick-quoted thing in a longer run of backticks, and
 * reading only single ones both loses that span's padding spaces (a missed
 * dead path) and can take the inner backticks for delimiters of their own (a
 * path matched out of text that names none).
 *
 * The text is a whole paragraph rather than a line, because a span closes on a
 * later line as readily as on its own. Feeding lines in one at a time is what
 * makes the second half of a wrapped span look like a span of its own.
 *
 * Backslash escapes are not honoured. `\` cannot appear in a candidate path, so
 * an escaped backtick can only merge a span into something that is no longer a
 * path end to end, which is the side that under-reports.
 */
function inlineCodeSpans(text: string): CodeSpan[] {
  const runs: { start: number; end: number }[] = [];
  BACKTICK_RUN_RE.lastIndex = 0;
  for (let m = BACKTICK_RUN_RE.exec(text); m !== null; m = BACKTICK_RUN_RE.exec(text)) {
    runs.push({ start: m.index, end: m.index + m[0].length });
  }

  const spans: CodeSpan[] = [];
  for (let i = 0; i < runs.length; i++) {
    const open = runs[i];
    const length = open.end - open.start;
    const close = runs.findIndex((r, j) => j > i && r.end - r.start === length);
    if (close === -1) continue;
    spans.push({
      content: stripPadding(text.slice(open.end, runs[close].start)),
      index: open.end,
    });
    // What stood between the two runs was code, so no run inside it can open a
    // span of its own.
    i = close;
  }
  return spans;
}

/**
 * CommonMark strips one space from each end of a span that has both, which is
 * how a span holds a backtick of its own (`` ` `` ). A span of nothing but
 * spaces keeps them, and is not a path either way.
 */
function stripPadding(content: string): string {
  const padded =
    content.length >= 2 &&
    content.startsWith(" ") &&
    content.endsWith(" ") &&
    content.trim() !== "";
  return padded ? content.slice(1, -1) : content;
}

/**
 * Every source path named by a code span on one line of Markdown, read in
 * isolation. `checkSourcePaths` reads a paragraph at a time instead, since a
 * span can wrap; this stays for a caller that has one line and nothing else.
 */
export function sourcePathsInLine(line: string, prefixes: ReadonlySet<string>): string[] {
  const paths: string[] = [];
  for (const span of inlineCodeSpans(line)) {
    const path = candidatePath(span.content, prefixes);
    if (path !== undefined) paths.push(path);
  }
  return paths;
}

/** The declared reason when a line carries the marker, otherwise `undefined`. */
export function absentPathReason(line: string): string | undefined {
  const m = MARKER_RE.exec(line);
  return m === null ? undefined : m[1].trim();
}

/** Where the content after each block-quote marker starts, `0` first, so the
 * last index is the line's quote depth. */
function quoteOffsets(line: string): number[] {
  const offsets = [0];
  for (;;) {
    const m = QUOTE_MARKER_RE.exec(line.slice(offsets[offsets.length - 1]));
    if (m === null) return offsets;
    offsets.push(offsets[offsets.length - 1] + m[0].length);
  }
}

/** What the line-by-line pass needs to know about each line of a document. */
interface ScannedLines {
  /** Frontmatter, a fence delimiter, or fenced content: not the record's prose. */
  skipped: boolean[];
  /** Paths named on the line that are not in the working tree. */
  missing: string[][];
}

/**
 * Read a document's prose paragraph by paragraph and collect, per line, the
 * paths it names that do not resolve.
 *
 * Two regions are left out. YAML frontmatter is validated by the frontmatter
 * rules and carries stand-in names (`applicable_to` says things like
 * `packages/foo`), and a fenced block holds commands and transcripts rather
 * than the record's own claims.
 */
function scanLines(
  lines: readonly string[],
  prefixes: ReadonlySet<string>,
  repoRoot: string,
): ScannedLines {
  const skipped = lines.map(() => false);
  const missing = lines.map((): string[] => []);
  let inFrontmatter = lines[0]?.trim() === "---";
  let openFence: { delim: string; depth: number } | undefined;
  let paragraph: { text: string; index: number }[] = [];

  /** A paragraph is the unit a span may wrap inside, so it is read as a whole. */
  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const text = paragraph.map((l) => l.text).join("\n");
    const starts: number[] = [];
    let at = 0;
    for (const l of paragraph) {
      starts.push(at);
      at += l.text.length + 1;
    }
    for (const span of inlineCodeSpans(text)) {
      const path = candidatePath(span.content, prefixes);
      if (path === undefined) continue;
      if (existsSync(resolve(repoRoot, path))) continue;
      // A path holds no newline, so the span that names one sits on a single
      // line of the paragraph.
      let line = 0;
      while (line + 1 < starts.length && starts[line + 1] <= span.index) line++;
      missing[paragraph[line].index].push(path);
    }
    paragraph = [];
  };

  lines.forEach((line, index) => {
    if (inFrontmatter) {
      skipped[index] = true;
      if (index > 0 && /^---\s*$/.test(line)) inFrontmatter = false;
      return;
    }

    const offsets = quoteOffsets(line);
    const depth = offsets.length - 1;

    if (openFence !== undefined) {
      if (depth < openFence.depth) {
        // The quote that held the fence has closed, and the fence with it, as
        // it does in CommonMark. That is also what keeps a quoted fence with
        // no closer from silencing the rest of the document.
        openFence = undefined;
      } else {
        // Inside a fence only a bare delimiter of the same character, at least
        // as long, and at the fence's own quote depth closes it. CommonMark
        // gives a closing fence no info string, so ```ts inside a ``` block is
        // content; so is a delimiter one quote deeper, which still carries a
        // `>` once the fence's own markers come off.
        const fence = FENCE_RE.exec(line.slice(offsets[openFence.depth]));
        const closes =
          fence !== null &&
          fence[1][0] === openFence.delim[0] &&
          fence[1].length >= openFence.delim.length &&
          fence[2].trim() === "";
        skipped[index] = true;
        if (closes) openFence = undefined;
        return;
      }
    }

    const content = line.slice(offsets[depth]);
    const fence = FENCE_RE.exec(content);
    // A backtick fence's info string may not contain a backtick, so ```lang`x
    // opens nothing: it is a paragraph holding an inline span, and is read as
    // one below. Opening a phantom fence on it would silence the rest of the
    // document.
    if (fence !== null && !(fence[1][0] === "`" && fence[2].includes("`"))) {
      flushParagraph();
      skipped[index] = true;
      openFence = { delim: fence[1], depth };
      return;
    }

    // A blank line ends a paragraph, and so does the declaration, which is an
    // HTML block rather than prose. Neither can hold a path of its own.
    if (content.trim() === "" || MARKER_RE.test(line)) {
      flushParagraph();
      return;
    }
    paragraph.push({ text: line, index });
  });

  flushParagraph();
  return { skipped, missing };
}

/**
 * Findings for one Markdown document.
 *
 * The **whole body** is scanned, not one section: a path can be named in the
 * 観点 prose or a checklist just as easily as under 関連テスト. What is left out
 * is frontmatter and fenced blocks (see `scanLines`).
 *
 * `repoRoot` is the directory every path resolves against, which the CLI sets
 * to the working directory.
 */
export function checkSourcePaths(
  markdown: string,
  prefixes: ReadonlySet<string>,
  repoRoot: string,
): SourcePathFinding[] {
  if (prefixes.size === 0) return [];

  const findings: SourcePathFinding[] = [];
  const lines = markdown.split("\n");
  const { skipped, missing } = scanLines(lines, prefixes, repoRoot);
  let pendingMarker: { line: number } | undefined;

  /** The pending declaration turned out to stand for nothing. */
  const reportUnusedMarker = (): void => {
    if (pendingMarker === undefined) return;
    findings.push({ kind: "absent-path-marker-unused", line: pendingMarker.line, path: "" });
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (skipped[index]) {
      // A declaration reaches the next line only, so one sitting on a fence
      // opener stands for nothing.
      reportUnusedMarker();
      pendingMarker = undefined;
      return;
    }

    const reason = absentPathReason(line);
    if (reason !== undefined) {
      // Two markers in a row: the first one's next line is another marker, so
      // it names no path.
      reportUnusedMarker();
      pendingMarker = undefined;
      if (reason === "") {
        // An invalid declaration earns no suppression: the next line is
        // checked normally, so a dead path behind it stays reported.
        findings.push({ kind: "absent-path-marker-empty-reason", line: lineNumber, path: "" });
      } else {
        pendingMarker = { line: lineNumber };
      }
      return;
    }

    if (pendingMarker !== undefined) {
      if (missing[index].length === 0) reportUnusedMarker();
      pendingMarker = undefined;
      return;
    }

    for (const path of missing[index]) {
      findings.push({ kind: "body-source-path-missing", line: lineNumber, path });
    }
  });

  // A marker on the last line of a file declares nothing.
  reportUnusedMarker();

  return findings;
}
