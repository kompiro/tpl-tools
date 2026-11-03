// The path globs a TPL's `scope.paths` holds (#41).
//
// Only `*`, `**` and `?` are understood. `engines.node >=20` rules out
// `path.matchesGlob`, and ADR-6 keeps the package free of new dependencies, so
// the matcher is written here and kept small. Any other glob syntax is
// rejected rather than read literally: a `{a,b}` that silently matches nothing
// is a key that never fires, which is the failure this field exists to avoid.

import { type Dirent, readdirSync } from "node:fs";
import { join } from "node:path";
import { GENERATED_SEGMENTS } from "./source-paths.ts";

/** Characters that mean something in a richer glob dialect than this one. */
const UNSUPPORTED_RE = /[[\]{}!]/;

/**
 * Why `glob` is not a glob this matcher reads, or `undefined` when it is.
 *
 * The rules mirror `candidatePath`: a repo-relative path with `/` separators,
 * no `.` or `..` segment, so a glob cannot reach outside the repository.
 */
export function globSyntaxError(glob: string): string | undefined {
  if (glob === "") return "is empty";
  if (glob.includes("\\")) return 'uses "\\"; write "/" separators';
  if (glob.startsWith("/") || glob.endsWith("/")) return 'has a leading or trailing "/"';
  if (UNSUPPORTED_RE.test(glob)) return "uses syntax other than *, ** and ?";
  const segments = glob.split("/");
  if (segments.some((s) => s === "")) return 'has an empty segment ("//")';
  if (segments.some((s) => s === "." || s === "..")) return 'has a "." or ".." segment';
  if (segments.some((s) => s !== "**" && s.includes("**"))) {
    return '"**" must be a whole path segment';
  }
  return undefined;
}

function segmentSource(segment: string): string {
  let out = "";
  for (const ch of segment) {
    if (ch === "*") out += "[^/]*";
    else if (ch === "?") out += "[^/]";
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return out;
}

/**
 * A RegExp matching the repo-relative paths `glob` names. `*` and `?` stay
 * inside one segment; a `**` segment spans zero or more segments, or one or
 * more when it ends the glob. A leading `.` is matched like any character, so
 * `*` reaches dotfiles. Call `globSyntaxError` first: the result for a glob
 * it rejects is unspecified.
 */
export function compileGlob(glob: string): RegExp {
  const segments = glob.split("/");
  let source = "";
  segments.forEach((segment, i) => {
    const last = i === segments.length - 1;
    if (segment === "**") source += last ? ".+" : "(?:[^/]+/)*";
    else source += segmentSource(segment) + (last ? "" : "/");
  });
  return new RegExp(`^${source}$`);
}

/** Whether the repo-relative `path` is one `glob` names. */
export function matchesGlob(path: string, glob: string): boolean {
  return compileGlob(glob).test(path);
}

/**
 * The leading segments of `glob` that hold no wildcard, joined with `/`. Every
 * path the glob matches lies under this directory, so a search for a match
 * need not walk the rest of the tree. Empty when the first segment has one.
 */
export function globBase(glob: string): string {
  const segments = glob.split("/");
  const base: string[] = [];
  // The last segment names the file itself, so it is never part of the base.
  for (const segment of segments.slice(0, -1)) {
    if (/[*?]/.test(segment)) break;
    base.push(segment);
  }
  return base.join("/");
}

/**
 * The files under `dir`, as paths relative to `root` with `/` separators.
 * `.git` and the build-output segments are not walked, the way
 * `candidatePath` ignores them, and symlinks are not followed, so a link loop
 * cannot hang the walk.
 */
function listFiles(root: string, dir: string): string[] {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === ".git" || GENERATED_SEGMENTS.has(entry.name)) continue;
      out.push(...listFiles(root, rel));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Whether `glob` matches at least one file under `repoRoot`. A glob that
 * matches nothing is a key that can never fire, the same rot as a source path
 * that no longer exists. `cache` holds the file lists already walked, keyed by
 * directory, so a corpus of globs sharing a base walks it once.
 */
export function globMatchesAFile(
  glob: string,
  repoRoot: string,
  cache: Map<string, readonly string[]> = new Map(),
): boolean {
  const base = globBase(glob);
  let files = cache.get(base);
  if (files === undefined) {
    files = listFiles(repoRoot, base);
    cache.set(base, files);
  }
  const re = compileGlob(glob);
  return files.some((f) => re.test(f));
}
