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

/** Inline code span: `…` (single backtick, no embedded backtick). */
const INLINE_CODE_RE = /`([^`\n]+)`/g;

/**
 * A fence opener or closer: three or more backticks or tildes, indented up to
 * three spaces. Both the character and the run length matter — a ```` fence
 * wrapping a ``` example closes only on four or more backticks, and a ~~~
 * fence does not close a ``` one.
 */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

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

/** Every source path named by a code span on one line of Markdown. */
export function sourcePathsInLine(line: string, prefixes: ReadonlySet<string>): string[] {
  const paths: string[] = [];
  for (const m of line.matchAll(INLINE_CODE_RE)) {
    const path = candidatePath(m[1], prefixes);
    if (path !== undefined) paths.push(path);
  }
  return paths;
}

/** The declared reason when a line carries the marker, otherwise `undefined`. */
export function absentPathReason(line: string): string | undefined {
  const m = MARKER_RE.exec(line);
  return m === null ? undefined : m[1].trim();
}

/**
 * Findings for one Markdown document.
 *
 * The **whole body** is scanned, not one section: a path can be named in the
 * 観点 prose or a checklist just as easily as under 関連テスト. Two regions are
 * skipped. YAML frontmatter is validated by the frontmatter rules and carries
 * stand-in names (`applicable_to` says things like `packages/foo`), and a
 * fenced block holds commands and transcripts rather than the record's own
 * claims.
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
  let inFrontmatter = lines[0]?.trim() === "---";
  let openFence: string | undefined;
  let pendingMarker: { line: number } | undefined;

  /** The pending declaration turned out to stand for nothing. */
  const reportUnusedMarker = (): void => {
    if (pendingMarker === undefined) return;
    findings.push({ kind: "absent-path-marker-unused", line: pendingMarker.line, path: "" });
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (inFrontmatter) {
      if (index > 0 && /^---\s*$/.test(line)) inFrontmatter = false;
      return;
    }

    const fence = FENCE_RE.exec(line);
    if (openFence !== undefined) {
      // Inside a fence only a bare delimiter of the same character, and at
      // least as long, closes it. CommonMark gives a closing fence no info
      // string, so ```ts inside a ``` block is content rather than the close.
      const closes =
        fence !== null &&
        fence[1][0] === openFence[0] &&
        fence[1].length >= openFence.length &&
        fence[2].trim() === "";
      if (closes) openFence = undefined;
      return;
    }
    if (fence !== null) {
      // A backtick fence's info string may not contain a backtick, so ```lang`x
      // opens nothing — it is a paragraph holding an inline span. Opening a
      // phantom fence on it would silence the rest of the document.
      if (fence[1][0] === "`" && fence[2].includes("`")) return;
      // A declaration reaches the next line only, so one sitting on a fence
      // opener stands for nothing.
      reportUnusedMarker();
      pendingMarker = undefined;
      openFence = fence[1];
      return;
    }

    const reason = absentPathReason(line);
    if (reason !== undefined) {
      // Two markers in a row: the first one's next line is another marker, so
      // it names no path.
      reportUnusedMarker();
      pendingMarker = undefined;
      if (reason === "") {
        // An invalid declaration earns no suppression — the next line is
        // checked normally, so a dead path behind it stays reported.
        findings.push({ kind: "absent-path-marker-empty-reason", line: lineNumber, path: "" });
      } else {
        pendingMarker = { line: lineNumber };
      }
      return;
    }

    const missing = sourcePathsInLine(line, prefixes).filter(
      (path) => !existsSync(resolve(repoRoot, path)),
    );

    if (pendingMarker !== undefined) {
      if (missing.length === 0) reportUnusedMarker();
      pendingMarker = undefined;
      return;
    }

    for (const path of missing) {
      findings.push({ kind: "body-source-path-missing", line: lineNumber, path });
    }
  });

  // A marker on the last line of a file declares nothing.
  reportUnusedMarker();

  return findings;
}
