import { readFileSync } from "node:fs";

/**
 * Reference data the TPL tools may consult. Currently just the controlled
 * `topics` vocabulary; kept as an object so it can grow without changing
 * call sites.
 */
export interface ReferenceData {
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

const EMPTY: ReferenceData = { topics: [] };

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * Load reference data from a JSON file.
 *
 * The file is expected to contain a `topics` array of strings (other keys are
 * ignored — this is intentionally lenient so the same file can serve other
 * tools). When `path` is `undefined`, returns empty reference data, which
 * disables topic validation entirely. There is deliberately **no default
 * filename** — the caller decides which file (if any) holds this data.
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

  const topicsRaw = (raw as Record<string, unknown>).topics ?? [];
  if (!isStringArray(topicsRaw)) {
    throw new ReferenceDataInvalidError(`${path}: "topics" must be an array of strings`);
  }
  return { topics: topicsRaw };
}
