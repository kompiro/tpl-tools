import { statSync } from "node:fs";
import { posix, resolve } from "node:path";
import { formatStatus, statusOf } from "./checklist.ts";
import { DEFAULT_TEST_FILE_INFIXES } from "./config.ts";
import { compileGlob, globSyntaxError } from "./glob.ts";
import { GENERATED_SEGMENTS, namedSourcePaths } from "./source-paths.ts";
import type { ParsedTpl, Status } from "./validate.ts";

interface RelatedFilter {
  topic?: string;
  pkg?: string;
  /** Defaults to ["active"] (deprecated entries are hidden by default). */
  includeStatus?: readonly Status[];
}

/** Returns TPLs whose `topic` and/or `scope.packages` match the filter. */
export function findRelated(parsed: readonly ParsedTpl[], filter: RelatedFilter): ParsedTpl[] {
  const statusSet = new Set<Status>(filter.includeStatus ?? ["active"]);
  return parsed.filter((p) => {
    if (!statusSet.has(p.fm.status)) return false;
    if (filter.topic !== undefined && p.fm.topic !== filter.topic) return false;
    if (filter.pkg !== undefined) {
      const packages = p.fm.scope?.packages ?? [];
      if (!packages.includes(filter.pkg)) return false;
    }
    return true;
  });
}

interface ChangedFilesOptions {
  /** Top-level source directories; a body path counts only under one of them. */
  sourcePrefixes: readonly string[];
  /** Directory the body paths resolve against. Defaults to `process.cwd()`. */
  repoRoot?: string;
  /** See `ReferenceData.testFileInfixes`. Defaults to `DEFAULT_TEST_FILE_INFIXES`. */
  testFileInfixes?: readonly string[];
  /** Defaults to ["active"] (deprecated entries are hidden by default). */
  includeStatus?: readonly Status[];
}

export interface ChangedFileMatch {
  tpl: ParsedTpl;
  /** Sum of `1 / fan-in` over `files`; higher means more specific to this change. */
  weight: number;
  /** The changed files this TPL matched, in the order they were given. */
  files: string[];
}

/**
 * The source a test file covers, by stripping the first infix that ends the
 * name before its extension (`a/foo.test.ts` → `a/foo.ts`), or `undefined`
 * when `path` is not named like a test file.
 */
export function sourceOfTestFile(path: string, infixes: readonly string[]): string | undefined {
  const dir = posix.dirname(path);
  const base = posix.basename(path);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const name = base.slice(0, dot);
  const ext = base.slice(dot);
  for (const infix of infixes) {
    if (name.length > infix.length && name.endsWith(infix)) {
      const source = name.slice(0, -infix.length) + ext;
      return dir === "." ? source : `${dir}/${source}`;
    }
  }
  return undefined;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Weights closer than this are a tie, so float rounding cannot beat the id order. */
const WEIGHT_EPSILON = 1e-9;

/** What a changed file has to equal, or match, to recall one TPL. */
interface TplKeys {
  files: Set<string>;
  globs: RegExp[];
}

/**
 * The keys a TPL is recalled by: each file its body names under a source
 * prefix, the source of each such file that is a test, and its `scope.paths`
 * globs. A path that is a directory in the tree is left out, since it names
 * many files rather than one. A missing path stays a key: a change that
 * deletes or restores the file is the one the TPL most needs to be seen for,
 * and `tpl validate` reports the dangling path on its own.
 */
function keysOf(
  tpl: ParsedTpl,
  prefixes: ReadonlySet<string>,
  repoRoot: string,
  infixes: readonly string[],
): TplKeys {
  const files = new Set<string>();
  for (const path of namedSourcePaths(tpl.body, prefixes, { frontmatter: false })) {
    if (isDirectory(resolve(repoRoot, path))) continue;
    files.add(path);
    const source = sourceOfTestFile(path, infixes);
    if (source !== undefined) files.add(source);
  }
  const scope = tpl.fm.scope as { paths?: unknown } | undefined;
  const raw = Array.isArray(scope?.paths) ? scope.paths : [];
  const globs = raw
    .filter((g): g is string => typeof g === "string" && globSyntaxError(g) === undefined)
    .map(compileGlob);
  return { files, globs };
}

/**
 * Whether a glob may match `path`. `tpl validate` proves a glob live by
 * walking the tree without entering `.git` or build output, so a match there
 * is one validate could never see; leaving it out keeps the two in agreement.
 */
function globbable(path: string): boolean {
  return !path.split("/").some((s) => s === ".git" || GENERATED_SEGMENTS.has(s));
}

/** Compare TPL ids so that `TPL-219` sorts before `TPL-1032`. */
function compareIds(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

/**
 * TPLs related to a set of changed files, most specific first.
 *
 * A TPL matches a changed file that its body names, that is the source of a
 * test file its body names, or that one of its `scope.paths` globs matches.
 * Each match is weighted by the inverse of the file's fan-in (how many of the
 * considered TPLs match it), so a file every renderer TPL names counts for
 * less than one only this TPL names. Ties break by id, so the order is
 * deterministic.
 */
export function findRelatedByChangedFiles(
  parsed: readonly ParsedTpl[],
  changedFiles: readonly string[],
  options: ChangedFilesOptions,
): ChangedFileMatch[] {
  const statusSet = new Set<Status>(options.includeStatus ?? ["active"]);
  const prefixes = new Set(options.sourcePrefixes);
  const repoRoot = options.repoRoot ?? process.cwd();
  const infixes = options.testFileInfixes ?? DEFAULT_TEST_FILE_INFIXES;
  const changed = [...new Set(changedFiles)];

  const hits = new Map<ParsedTpl, string[]>();
  const fanIn = new Map<string, number>();
  for (const tpl of parsed) {
    if (!statusSet.has(tpl.fm.status)) continue;
    const keys = keysOf(tpl, prefixes, repoRoot, infixes);
    const files = changed.filter(
      (f) => keys.files.has(f) || (globbable(f) && keys.globs.some((g) => g.test(f))),
    );
    if (files.length === 0) continue;
    hits.set(tpl, files);
    for (const f of files) fanIn.set(f, (fanIn.get(f) ?? 0) + 1);
  }

  return [...hits]
    .map(([tpl, files]) => ({
      tpl,
      files,
      weight: files.reduce((sum, f) => sum + 1 / fanIn.get(f)!, 0),
    }))
    .sort((a, b) =>
      Math.abs(b.weight - a.weight) < WEIGHT_EPSILON
        ? compareIds(a.tpl.fm.id, b.tpl.fm.id)
        : b.weight - a.weight,
    );
}

interface FormatOptions {
  /**
   * Path prefix prepended to TPL filenames in the output. Use the repo-root
   * relative form (e.g. `docs/test-perspectives/`) so the rendered link works
   * in GitHub regardless of where the consuming markdown lives.
   */
  pathPrefix?: string;
  /**
   * Heading of the checklist section. When given, each line ends with the
   * enforcement status derived from the TPL's checklist markers. Off by
   * default: the plain list is what gets pasted into a Design Doc.
   */
  statusHeading?: string;
  /**
   * The changed files each TPL matched, keyed by TPL id. When given, each
   * line ends with them, so a reader sees why the TPL is listed.
   */
  matchedFiles?: ReadonlyMap<string, readonly string[]>;
}

/**
 * Render a list of TPLs as a markdown bullet list suitable for pasting into
 * a Design Doc's "Related TPLs" section.
 */
export function formatRelatedAsMarkdown(
  matched: readonly ParsedTpl[],
  options: FormatOptions = {},
): string {
  const prefix = options.pathPrefix ?? "docs/test-perspectives/";
  if (matched.length === 0) return "";
  const heading = options.statusHeading;
  return matched
    .map((p) => {
      const status =
        heading === undefined
          ? ""
          : ` · ${formatStatus(statusOf(p.body, heading, { frontmatter: false }))}`;
      const files = options.matchedFiles?.get(p.fm.id);
      const via =
        files === undefined || files.length === 0
          ? ""
          : ` · via ${files.map((f) => `\`${f}\``).join(", ")}`;
      return `- [${p.fm.id}](${prefix}${p.file}) — ${p.fm.title}${status}${via}`;
    })
    .join("\n");
}
