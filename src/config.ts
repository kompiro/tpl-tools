import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, posix, resolve } from "node:path";

/** Default reference-data filename looked up in the working directory. */
export const CONFIG_FILENAME = "tpl.config.json";

/**
 * Decide which reference-data file to load, given an optional explicit path:
 *   1. an explicit `--config` path (highest priority — keeps back-compat with
 *      a shared file such as `adr.config.json`)
 *   2. `tpl.config.json` in `cwd`, when present (lets tpl be used standalone)
 *   3. `undefined` — no file; topic validation is skipped and the default id
 *      format is used
 */
export function resolveConfigPath(explicit: string | undefined, cwd: string): string | undefined {
  if (explicit !== undefined) return resolve(cwd, explicit);
  const fallback = resolve(cwd, CONFIG_FILENAME);
  return existsSync(fallback) ? fallback : undefined;
}

/**
 * TPL id / filename convention:
 *   - `date-sequence` (default) → `TPL-YYYYMMDD-NN`, file `TPL-YYYYMMDD-NN-<slug>.md`
 *   - `issue-number`            → `TPL-<n>` (no zero padding), file `TPL-<n>-<slug>.md`
 */
export type IdFormat = "date-sequence" | "issue-number";

export const ID_FORMATS = ["date-sequence", "issue-number"] as const satisfies readonly IdFormat[];

export const DEFAULT_ID_FORMAT: IdFormat = "date-sequence";

/**
 * Reference data the TPL tools may consult: the controlled `topics`
 * vocabulary and the TPL id `idFormat`. Kept as an object so it can grow
 * without changing call sites.
 */
export interface ReferenceData {
  /** TPL id / filename convention. See `IdFormat`. */
  idFormat: IdFormat;
  /** Allowed values for a TPL's `topic` field. Empty = no topic validation. */
  topics: readonly string[];
  /**
   * Generated index file, relative to the TPL directory (e.g. `index.md`).
   * When set, `tpl regenerate` writes it and `tpl validate` checks it instead
   * of `README.md`. Unset keeps the hand-maintained README index.
   */
  indexFile?: string;
  /**
   * `false` turns off every index check in `tpl validate`: neither the
   * `indexFile` nor `README.md` is read, so a missing, lagging or stale index
   * is not a finding. For a repo whose index is written outside its PRs (a
   * scheduled regeneration), where the index may lag or not exist yet.
   * `tpl regenerate` ignores it. Unset or `true` keeps the check.
   *
   * The CLI applies it by passing `validateAll` neither `readmePath` nor
   * `indexPath`; a library caller does the same.
   */
  indexCheck?: boolean;
  /**
   * Heading text of the checklist section (e.g. `Checklist`). When set, each
   * checklist item may end with a `[guard: …]` or `[judgment]` marker,
   * `tpl validate` checks the section and its markers, and the commands that
   * list TPLs can show the status derived from them. Unset turns all of that
   * off.
   */
  checklistHeading?: string;
  /**
   * Top-level directories that hold source (e.g. `packages`, `scripts`). A
   * code span in a TPL body counts as a source path only when its first
   * segment is one of these: `tpl validate` checks those paths exist, and
   * `tpl related --changed-files` / `--base` match changed files against them.
   * `--source-prefix` on the command line replaces this list. Unset means no
   * prefix, so both read nothing from the body.
   */
  sourcePrefixes?: readonly string[];
  /**
   * How a test file's name relates to its source's: the part a test file adds
   * just before its extension (`foo.test.ts` → `foo.ts`, `foo_test.go` →
   * `foo.go`). A TPL naming a test file is also recalled when that source
   * changes. Unset uses `DEFAULT_TEST_FILE_INFIXES`; an empty list turns the
   * mapping off.
   */
  testFileInfixes?: readonly string[];
}

/** The TypeScript / JavaScript test-file conventions, `foo.test.ts` and `foo.spec.ts`. */
export const DEFAULT_TEST_FILE_INFIXES: readonly string[] = [".test", ".spec"];

/**
 * Why `prefix` cannot be a source prefix, or `undefined` when it can. A prefix
 * is compared with a path's first segment, so anything that cannot be one
 * segment would make the check run over nothing.
 */
export function sourcePrefixError(prefix: string): string | undefined {
  if (prefix === "") return "is empty";
  if (prefix.includes("/") || prefix.includes("\\")) return "is a path, not one directory name";
  if (prefix === "." || prefix === "..") return 'is "." or ".."';
  return undefined;
}

export class ReferenceDataInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceDataInvalidError";
  }
}

export class ReferenceDataMissingError extends Error {
  constructor(path: string) {
    super(`reference-data file not found at ${path}`);
    this.name = "ReferenceDataMissingError";
  }
}

const EMPTY: ReferenceData = { idFormat: DEFAULT_ID_FORMAT, topics: [] };

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * Load reference data from a JSON file.
 *
 * The file is expected to contain a `topics` array of strings, an optional
 * `idFormat` string (`"date-sequence"` or `"issue-number"`), an optional
 * `indexFile` string, an optional `indexCheck` boolean, an optional
 * `checklistHeading` string, and optional `sourcePrefixes` and
 * `testFileInfixes` string arrays. Other keys are
 * ignored — this is intentionally lenient so the same file can serve other
 * tools. When `path` is `undefined`, returns empty reference data, which
 * disables topic validation entirely and falls back to the default id format.
 * There is deliberately **no default filename** — the caller decides which
 * file (if any) holds this data.
 */
export function loadReferenceData(path?: string): ReferenceData {
  if (path === undefined) return EMPTY;

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new ReferenceDataMissingError(path);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ReferenceDataInvalidError(`${path}: invalid JSON: ${(e as Error).message}`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ReferenceDataInvalidError(`${path}: top-level must be a JSON object`);
  }

  const obj = raw as Record<string, unknown>;

  let idFormat: IdFormat = DEFAULT_ID_FORMAT;
  if (obj.idFormat !== undefined) {
    if (
      typeof obj.idFormat !== "string" ||
      !(ID_FORMATS as readonly string[]).includes(obj.idFormat)
    ) {
      throw new ReferenceDataInvalidError(
        `${path}: "idFormat" must be one of ${ID_FORMATS.join(" | ")}, got ${JSON.stringify(obj.idFormat)}`,
      );
    }
    idFormat = obj.idFormat as IdFormat;
  }

  const topicsRaw = obj.topics ?? [];
  if (!isStringArray(topicsRaw)) {
    throw new ReferenceDataInvalidError(`${path}: "topics" must be an array of strings`);
  }

  let indexFile: string | undefined;
  if (obj.indexFile !== undefined) {
    if (typeof obj.indexFile !== "string" || obj.indexFile === "") {
      throw new ReferenceDataInvalidError(
        `${path}: "indexFile" must be a non-empty string, got ${JSON.stringify(obj.indexFile)}`,
      );
    }
    // `tpl regenerate` writes this file, so it must stay inside the TPL
    // directory. Accept one spelling only, a relative path with `/`
    // separators: a backslash is a separator on Windows but a filename
    // character on POSIX, and the checks below would differ by platform.
    const raw = obj.indexFile;
    if (
      raw.includes("\\") ||
      raw.startsWith("/") ||
      raw.endsWith("/") ||
      isAbsolute(raw) ||
      raw.split("/").includes("..")
    ) {
      throw new ReferenceDataInvalidError(
        `${path}: "indexFile" must be a file path inside the TPL directory, relative and with "/" separators (no "\\", no leading or trailing "/", no ".."), got ${JSON.stringify(raw)}`,
      );
    }
    // The TPL directory's own `TPL-*.md` files are read as TPLs, so an index
    // there under such a name would be validated as one. Normalize first so
    // `./TPL-x.md` counts as directly in the directory and `TPL-x/index.md`
    // does not.
    if (/^TPL-[^/]*\.md$/.test(posix.normalize(raw))) {
      throw new ReferenceDataInvalidError(
        `${path}: "indexFile" must not be named like a TPL (TPL-*.md), got ${JSON.stringify(raw)}`,
      );
    }
    indexFile = raw;
  }

  if (obj.indexCheck !== undefined && typeof obj.indexCheck !== "boolean") {
    throw new ReferenceDataInvalidError(
      `${path}: "indexCheck" must be true or false, got ${JSON.stringify(obj.indexCheck)}`,
    );
  }
  const indexCheck = obj.indexCheck as boolean | undefined;

  let checklistHeading: string | undefined;
  if (obj.checklistHeading !== undefined) {
    const raw = obj.checklistHeading;
    // The value is compared with a heading's text, so the `#` markers and
    // surrounding space are not part of it, and a heading is one line.
    if (
      typeof raw !== "string" ||
      raw.trim() === "" ||
      raw !== raw.trim() ||
      /[\r\n]/.test(raw) ||
      raw.startsWith("#")
    ) {
      throw new ReferenceDataInvalidError(
        `${path}: "checklistHeading" must be the heading's text on one line, without "#" or surrounding space (e.g. "Checklist"), got ${JSON.stringify(raw)}`,
      );
    }
    checklistHeading = raw;
  }

  let sourcePrefixes: string[] | undefined;
  if (obj.sourcePrefixes !== undefined) {
    if (!isStringArray(obj.sourcePrefixes)) {
      throw new ReferenceDataInvalidError(`${path}: "sourcePrefixes" must be an array of strings`);
    }
    for (const prefix of obj.sourcePrefixes) {
      const error = sourcePrefixError(prefix);
      if (error !== undefined) {
        throw new ReferenceDataInvalidError(
          `${path}: "sourcePrefixes" holds top-level directory names, but ${JSON.stringify(prefix)} ${error}`,
        );
      }
    }
    sourcePrefixes = obj.sourcePrefixes;
  }

  let testFileInfixes: string[] | undefined;
  if (obj.testFileInfixes !== undefined) {
    if (
      !isStringArray(obj.testFileInfixes) ||
      obj.testFileInfixes.some((x) => x === "" || x.includes("/") || x.includes("\\"))
    ) {
      throw new ReferenceDataInvalidError(
        `${path}: "testFileInfixes" must be an array of non-empty strings without "/" or "\\" (e.g. [".test", ".spec"]), got ${JSON.stringify(obj.testFileInfixes)}`,
      );
    }
    testFileInfixes = obj.testFileInfixes;
  }

  return {
    idFormat,
    topics: topicsRaw,
    ...(indexFile === undefined ? {} : { indexFile }),
    ...(indexCheck === undefined ? {} : { indexCheck }),
    ...(checklistHeading === undefined ? {} : { checklistHeading }),
    ...(sourcePrefixes === undefined ? {} : { sourcePrefixes }),
    ...(testFileInfixes === undefined ? {} : { testFileInfixes }),
  };
}
