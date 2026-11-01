// Reads the checklist section of a TPL body and the marker each item carries,
// and derives the TPL's enforcement status from them (#31).
//
// A checklist mixes items that CI already enforces with items that rely on a
// person remembering the TPL, and nothing in the body told them apart. Each
// item may now end with one marker:
//
//   - [ ] ... [guard: `packages/x/y.test.ts`]   enforced by the named file
//   - [ ] ... [judgment]                        cannot be decided by a program
//   - [ ] ...                                   checkable but unguarded
//
// The status is derived from the markers and never stored, so it cannot drift
// from the checklist it summarizes.

import { statSync } from "node:fs";
import { resolve } from "node:path";
import { absentPathReason, candidatePath, inlineCodeSpans } from "./source-paths.ts";

export type EnforcementStatus = "guarded" | "partial" | "unguarded" | "judgment";

export const ENFORCEMENT_STATUSES = [
  "guarded",
  "partial",
  "unguarded",
  "judgment",
] as const satisfies readonly EnforcementStatus[];

/** One code span inside a `[guard: …]` marker. */
export interface GuardSpan {
  /** The span's content, padding stripped. Not yet checked to be a path. */
  content: string;
  /** 1-based line in the document. */
  line: number;
}

export type Marker =
  | { kind: "guard"; spans: GuardSpan[] }
  | { kind: "judgment" }
  | { kind: "none" }
  | { kind: "malformed"; reason: string; line: number };

export interface ChecklistItem {
  /** 1-based position in the checklist. */
  n: number;
  /** 1-based line of the item's list marker in the document. */
  line: number;
  /** The item's text on one line, without the list marker, task box or marker. */
  text: string;
  marker: Marker;
}

export interface Checklist {
  /** 1-based line of the heading. */
  line: number;
  items: ChecklistItem[];
}

/** An ATX heading, up to three spaces of indentation, optional closing hashes. */
const HEADING_RE = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?[ \t]*$/;
const CLOSING_HASHES_RE = /[ \t]+#+$|^#+$/;

/** A fence opener or closer (see `source-paths.ts`). */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * A top-level list item. Only column 0 counts: an indented marker is a nested
 * item or a continuation, and either one belongs to the item above it.
 */
const ITEM_RE = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$)/;
const TASK_BOX_RE = /^\[[ xX]\](?:[ \t]+|$)/;

/** A thematic break (`* * *`, `- - -`), which is not a list item. */
const THEMATIC_BREAK_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/** A whole-line HTML comment, such as the absent-path declaration. */
const COMMENT_LINE_RE = /^\s*<!--[^]*-->\s*$/;

/**
 * Anything that looks like the start of a marker. Prose that merely says
 * "guard" or "judgment" has no bracket and is not matched; a bracketed one
 * outside a code span is, and must then be a well-formed marker at the end.
 */
const MARKER_TOKEN_RE = /\[\s*(?:guard|judgment)\b/gi;

function headingText(line: string): string | undefined {
  const m = HEADING_RE.exec(line);
  if (m === null) return undefined;
  return (m[1] ?? "").replace(CLOSING_HASHES_RE, "").trim();
}

interface RawItem {
  line: number;
  /** Width of the list marker and the space after it: the content column. */
  width: number;
  lines: { text: string; line: number }[];
}

/** A list marker, top-level or nested, with the space after it. */
const LIST_MARKER_RE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+/;

/** A line with up to `width` of its leading spaces removed. */
function dropIndent(text: string, width: number): string {
  let at = 0;
  while (at < width && text[at] === " ") at++;
  return text.slice(at);
}

/**
 * The fence a line opens, with the content column of the item holding it, or
 * `undefined` when the line opens none. Indentation is removed only up to the
 * item's content column, so a fence indented four or more spaces past it is
 * indented code, as in CommonMark; a nested list marker comes off first.
 */
function fenceOpener(
  line: string,
  itemStart: RegExpExecArray | null,
  current: RawItem | undefined,
): { delim: string; indent: number | undefined } | undefined {
  let subject = line;
  let indent: number | undefined;
  if (itemStart !== null) {
    indent = itemStart[0].length;
    subject = line.slice(indent);
  } else if (current !== undefined && line.trim() !== "" && /^\s/.test(line)) {
    indent = current.width;
    subject = dropIndent(line, indent);
    const nested = LIST_MARKER_RE.exec(subject);
    if (nested !== null) {
      indent += nested[0].length;
      subject = subject.slice(nested[0].length);
    }
  }
  const fence = FENCE_RE.exec(subject);
  if (fence === null) return undefined;
  // A backtick fence's info string may not hold a backtick (see source-paths.ts).
  if (fence[1][0] === "`" && fence[2].includes("`")) return undefined;
  return { delim: fence[1], indent };
}

export interface ExtractOptions {
  /**
   * Whether `markdown` may start with YAML frontmatter to skip. Pass `false`
   * for a body whose frontmatter is already removed, where a leading `---` is
   * a thematic break. Defaults to `true`.
   */
  frontmatter?: boolean;
}

/**
 * The checklist section: from the first heading whose text is `heading` to
 * the next heading of any level, so a `###` inside the section ends it.
 * `undefined` when the document has no such heading.
 */
export function extractChecklist(
  markdown: string,
  heading: string,
  options: ExtractOptions = {},
): Checklist | undefined {
  // A CRLF checkout (Windows, core.autocrlf) holds the same document.
  const lines = splitLines(markdown);
  let start = 0;
  if ((options.frontmatter ?? true) && lines[0]?.trim() === "---") {
    const close = lines.findIndex((l, i) => i > 0 && /^---\s*$/.test(l));
    start = close === -1 ? lines.length : close + 1;
  }

  // `indent` is the content column of the item that holds the fence, or
  // undefined for a fence outside any item.
  let openFence: { delim: string; indent: number | undefined } | undefined;
  let headingLine: number | undefined;
  const raw: RawItem[] = [];
  let current: RawItem | undefined;
  let afterBlank = false;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (openFence !== undefined) {
      if (openFence.indent !== undefined && line.trim() !== "" && !/^\s/.test(line)) {
        // A line at column 0 ends the item, and the item's fence with it, as
        // in CommonMark; the line itself is read normally below. Without this
        // one missing closer would hide the rest of the document.
        openFence = undefined;
        current = undefined;
      } else {
        const fence = FENCE_RE.exec(
          openFence.indent === undefined ? line : dropIndent(line, openFence.indent),
        );
        if (
          fence !== null &&
          fence[1][0] === openFence.delim[0] &&
          fence[1].length >= openFence.delim.length &&
          fence[2].trim() === ""
        ) {
          // A fenced block takes no lazy continuation, so only an indented
          // line continues the item after it.
          if (openFence.indent !== undefined) afterBlank = true;
          openFence = undefined;
        }
        continue;
      }
    }

    // A fence opens on an item's own line (`- ```sh`), on a line inside an
    // item (a nested item's own line included), or at the top level. One that
    // belongs to an item keeps the item open, so the lines after it continue
    // the item and its marker is still read.
    const itemStart = ITEM_RE.exec(line);
    const opener = fenceOpener(line, itemStart, current);
    if (opener !== undefined) {
      openFence = opener;
      if (headingLine !== undefined && itemStart !== null) {
        current = {
          line: i + 1,
          width: itemStart[0].length,
          lines: [{ text: itemStart[0], line: i + 1 }],
        };
        raw.push(current);
      } else if (opener.indent === undefined) {
        current = undefined;
      }
      afterBlank = false;
      continue;
    }

    const text = headingText(line);
    if (headingLine === undefined) {
      if (text === heading) headingLine = i + 1;
      continue;
    }
    if (text !== undefined) break;

    if (THEMATIC_BREAK_RE.test(line)) {
      // An indented break sits inside the item; one at column 0 ends it.
      if (current === undefined || !/^\s/.test(line)) current = undefined;
      continue;
    }
    if (itemStart !== null) {
      current = { line: i + 1, width: itemStart[0].length, lines: [{ text: line, line: i + 1 }] };
      raw.push(current);
      afterBlank = false;
      continue;
    }
    if (line.trim() === "") {
      afterBlank = true;
      continue;
    }
    if (COMMENT_LINE_RE.test(line)) {
      // An HTML block, not the item's prose: it ends the item rather than
      // joining its text, where it would push the marker off the end.
      current = undefined;
      continue;
    }
    if (current !== undefined && (!afterBlank || /^\s/.test(line))) {
      current.lines.push({ text: line, line: i + 1 });
      afterBlank = false;
      continue;
    }
    // Prose between items (an intro sentence) belongs to no item.
    current = undefined;
  }

  if (headingLine === undefined) return undefined;
  return { line: headingLine, items: raw.map((r, k) => parseItem(r, k + 1)) };
}

function splitLines(markdown: string): string[] {
  // CRLF only: a lone CR is no line break to the body source-path check, and
  // line numbers must agree with it.
  return markdown.replace(/\r\n/g, "\n").split("\n");
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseItem(raw: RawItem, n: number): ChecklistItem {
  const first = raw.lines[0].text.replace(ITEM_RE, "").replace(TASK_BOX_RE, "");
  const parts = [first, ...raw.lines.slice(1).map((l) => l.text)];
  const text = parts.join("\n").trimEnd();

  const starts: number[] = [];
  let at = 0;
  for (const p of parts) {
    starts.push(at);
    at += p.length + 1;
  }
  const lineAt = (offset: number): number => {
    let k = 0;
    while (k + 1 < starts.length && starts[k + 1] <= offset) k++;
    return raw.lines[k].line;
  };

  const { marker, cut } = parseMarker(text, lineAt);
  return { n, line: raw.line, text: oneLine(text.slice(0, cut)), marker };
}

/**
 * The marker at the end of `text`, and the offset where the item's own text
 * ends (the marker's start, or the end of the text).
 */
function parseMarker(
  text: string,
  lineAt: (offset: number) => number,
): { marker: Marker; cut: number } {
  const spans = inlineCodeSpans(text);
  const inSpan = (offset: number): boolean =>
    spans.some((s) => offset >= s.start && offset < s.end);

  const tokens: number[] = [];
  MARKER_TOKEN_RE.lastIndex = 0;
  for (let m = MARKER_TOKEN_RE.exec(text); m !== null; m = MARKER_TOKEN_RE.exec(text)) {
    if (!inSpan(m.index)) tokens.push(m.index);
  }
  if (tokens.length === 0) return { marker: { kind: "none" }, cut: text.length };

  const malformed = (reason: string, offset: number): { marker: Marker; cut: number } => ({
    marker: { kind: "malformed", reason, line: lineAt(offset) },
    cut: text.length,
  });

  if (tokens.length > 1) {
    return malformed(
      "only one marker, at the end of the item; put marker syntax that the item describes in a code span",
      tokens[0],
    );
  }

  const i = tokens[0];
  if (i > 0 && !/\s/.test(text[i - 1])) {
    return malformed("separate the marker from the item text with a space", i);
  }

  if (text.startsWith("[judgment]", i)) {
    if (i + "[judgment]".length !== text.length) {
      return malformed("the marker must be the last text of the item, with nothing after it", i);
    }
    return { marker: { kind: "judgment" }, cut: i };
  }

  if (!text.startsWith("[guard:", i)) {
    return malformed("expected `[judgment]` or `[guard: `path`]`", i);
  }

  const skipSpace = (from: number): number => {
    let k = from;
    while (k < text.length && /\s/.test(text[k])) k++;
    return k;
  };
  const guardSpans: GuardSpan[] = [];
  let cursor = skipSpace(i + "[guard:".length);
  for (;;) {
    const span = spans.find((s) => s.start === cursor);
    if (span === undefined) {
      return malformed("a guard names each file in a code span: [guard: `path`, `path`]", i);
    }
    guardSpans.push({ content: span.content, line: lineAt(span.start) });
    cursor = skipSpace(span.end);
    if (text[cursor] === ",") {
      cursor = skipSpace(cursor + 1);
      continue;
    }
    if (text[cursor] === "]") {
      cursor++;
      break;
    }
    return malformed("separate guard paths with commas and close the marker with `]`", i);
  }
  if (cursor !== text.length) {
    return malformed("the marker must be the last text of the item, with nothing after it", i);
  }
  return { marker: { kind: "guard", spans: guardSpans }, cut: i };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface StatusCounts {
  guarded: number;
  /** Unmarked items, and items whose marker is malformed. */
  unguarded: number;
  judgment: number;
  /** `undefined` when there is no item to derive a status from. */
  status: EnforcementStatus | undefined;
}

/**
 * Derive the status from the items. A malformed marker counts as unguarded:
 * it claims nothing a reader can rely on.
 */
export function deriveStatus(items: readonly ChecklistItem[]): StatusCounts {
  let guarded = 0;
  let unguarded = 0;
  let judgment = 0;
  for (const item of items) {
    if (item.marker.kind === "guard") guarded++;
    else if (item.marker.kind === "judgment") judgment++;
    else unguarded++;
  }
  let status: EnforcementStatus | undefined;
  if (items.length === 0) status = undefined;
  else if (guarded + unguarded === 0) status = "judgment";
  else if (unguarded === 0) status = "guarded";
  else if (guarded === 0) status = "unguarded";
  else status = "partial";
  return { guarded, unguarded, judgment, status };
}

/**
 * `guarded 2/2, judgment 2`: the status, then guarded over checkable items,
 * then the judgment items when there are any.
 */
export function formatStatus(counts: StatusCounts): string {
  if (counts.status === undefined) return "no checklist items";
  if (counts.status === "judgment") return `judgment ${counts.judgment}`;
  const checkable = `${counts.status} ${counts.guarded}/${counts.guarded + counts.unguarded}`;
  return counts.judgment > 0 ? `${checkable}, judgment ${counts.judgment}` : checkable;
}

/** Status of one TPL body, for display. Syntax only: guard paths are not resolved. */
export function statusOf(
  markdown: string,
  heading: string,
  options: ExtractOptions = {},
): StatusCounts {
  return deriveStatus(extractChecklist(markdown, heading, options)?.items ?? []);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ChecklistFinding =
  | { kind: "checklist-missing"; heading: string }
  | { kind: "checklist-empty"; line: number; heading: string }
  | { kind: "checklist-marker-malformed"; line: number; reason: string }
  | { kind: "checklist-guard-path-unchecked"; line: number; span: string }
  | { kind: "checklist-guard-missing"; line: number; path: string }
  | { kind: "checklist-guard-not-file"; line: number; path: string }
  | { kind: "checklist-guard-declared-absent"; line: number; path: string };

/**
 * Findings for one TPL document: a missing or empty section, a malformed
 * marker, and each guard path that is not a checkable file path, does not
 * exist, is a directory, or is declared absent. The missing-file finding
 * overlaps the body source-path check on purpose: that check reads a list as
 * one paragraph, so a stray backtick in an earlier item can hide the guard's
 * span from it. `validateAll` drops its duplicate.
 */
export function checkChecklist(
  markdown: string,
  heading: string,
  prefixes: ReadonlySet<string>,
  repoRoot: string,
): ChecklistFinding[] {
  const checklist = extractChecklist(markdown, heading);
  if (checklist === undefined) return [{ kind: "checklist-missing", heading }];
  if (checklist.items.length === 0) {
    return [{ kind: "checklist-empty", line: checklist.line, heading }];
  }

  const lines = splitLines(markdown);
  const findings: ChecklistFinding[] = [];
  for (const item of checklist.items) {
    const { marker } = item;
    if (marker.kind === "malformed") {
      findings.push({
        kind: "checklist-marker-malformed",
        line: marker.line,
        reason: marker.reason,
      });
      continue;
    }
    if (marker.kind !== "guard") continue;
    for (const span of marker.spans) {
      const path = candidatePath(span.content, prefixes);
      if (path === undefined || span.content.endsWith("/")) {
        findings.push({
          kind: "checklist-guard-path-unchecked",
          line: span.line,
          span: span.content,
        });
        continue;
      }
      if (absentPathReason(lines[span.line - 2] ?? "") !== undefined) {
        findings.push({ kind: "checklist-guard-declared-absent", line: span.line, path });
        continue;
      }
      let isFile: boolean | undefined;
      try {
        isFile = statSync(resolve(repoRoot, path)).isFile();
      } catch {
        isFile = undefined;
      }
      if (isFile === undefined) {
        findings.push({ kind: "checklist-guard-missing", line: span.line, path });
      } else if (!isFile) {
        findings.push({ kind: "checklist-guard-not-file", line: span.line, path });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

/** How an item reads in a listing. `malformed` is filtered with `unguarded`. */
export type RowMarker = "guard" | "judgment" | "unguarded" | "malformed";

export interface ChecklistRow {
  id: string;
  file: string;
  topic: string;
  /** 1-based position in the checklist. */
  n: number;
  marker: RowMarker;
  /** The guard spans, for a `guard` row. */
  guards: string[];
  text: string;
}

/**
 * Every checklist item of the given TPLs, in TPL then item order. Syntax only.
 * `body` is the text after the frontmatter, as `loadAllTpls` returns it.
 */
export function checklistRows(
  tpls: readonly { file: string; body: string; fm: { id: string; topic: string } }[],
  heading: string,
): ChecklistRow[] {
  const rows: ChecklistRow[] = [];
  for (const tpl of tpls) {
    for (const item of extractChecklist(tpl.body, heading, { frontmatter: false })?.items ?? []) {
      const { marker } = item;
      rows.push({
        id: tpl.fm.id,
        file: tpl.file,
        topic: tpl.fm.topic,
        n: item.n,
        marker: marker.kind === "none" ? "unguarded" : marker.kind,
        guards: marker.kind === "guard" ? marker.spans.map((s) => s.content) : [],
        text: item.text,
      });
    }
  }
  return rows;
}
