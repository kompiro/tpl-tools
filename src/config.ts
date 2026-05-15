import { readFileSync } from "node:fs";

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
 * The file is expected to contain a `topics` array of strings and an optional
 * `idFormat` string (`"date-sequence"` or `"issue-number"`). Other keys are
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
  return { idFormat, topics: topicsRaw };
}
