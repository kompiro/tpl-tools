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
  lines: { text: string; line: number }[];
}

/**
 * The checklist section: from the first heading whose text is `heading` to
 * the next heading of any level, so a `###` inside the section ends it.
 * `undefined` when the document has no such heading.
 */
export function extractChecklist(markdown: string, heading: string): Checklist | undefined {
  const lines = markdown.split("\n");
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((l, i) => i > 0 && /^---\s*$/.test(l));
    start = close === -1 ? lines.length : close + 1;
  }

  let openFence: string | undefined;
  let headingLine: number | undefined;
  const raw: RawItem[] = [];
  let current: RawItem | undefined;
  let afterBlank = false;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE_RE.exec(line);
    if (openFence !== undefined) {
      if (
        fence !== null &&
        fence[1][0] === openFence[0] &&
        fence[1].length >= openFence.length &&
        fence[2].trim() === ""
      ) {
        openFence = undefined;
      }
      continue;
    }
    if (fence !== null && !(fence[1][0] === "`" && fence[2].includes("`"))) {
      // A fence ends the item above it; its content is code, not the item's text.
      openFence = fence[1];
      current = undefined;
      continue;
    }

    const text = headingText(line);
    if (headingLine === undefined) {
      if (text === heading) headingLine = i + 1;
      continue;
    }
    if (text !== undefined) break;

    if (ITEM_RE.test(line)) {
      current = { line: i + 1, lines: [{ text: line, line: i + 1 }] };
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
export function statusOf(markdown: string, heading: string): StatusCounts {
  return deriveStatus(extractChecklist(markdown, heading)?.items ?? []);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ChecklistFinding =
  | { kind: "checklist-missing"; heading: string }
  | { kind: "checklist-empty"; line: number; heading: string }
  | { kind: "checklist-marker-malformed"; line: number; reason: string }
  | { kind: "checklist-guard-path-unchecked"; line: number; span: string }
  | { kind: "checklist-guard-not-file"; line: number; path: string }
  | { kind: "checklist-guard-declared-absent"; line: number; path: string };

/**
 * Findings for one TPL document. A guard path that does not exist is left to
 * the body source-path check, which already reports every missing path named
 * in a code span; this check adds what that one lets through: a span it skips
 * (so the guard would go unchecked), a directory, and a guard declared absent.
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

  const lines = markdown.split("\n");
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
      if (isFile === false) {
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

/** Every checklist item of the given TPLs, in TPL then item order. Syntax only. */
export function checklistRows(
  tpls: readonly { file: string; body: string; fm: { id: string; topic: string } }[],
  heading: string,
): ChecklistRow[] {
  const rows: ChecklistRow[] = [];
  for (const tpl of tpls) {
    for (const item of extractChecklist(tpl.body, heading)?.items ?? []) {
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
