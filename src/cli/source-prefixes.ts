import { type ReferenceData, sourcePrefixError } from "../config.ts";
import type { ParsedFlags } from "./args.ts";

/**
 * The source prefixes a command runs with: every `--source-prefix` given on
 * the command line, which replaces the config's `sourcePrefixes`, or the
 * config's list when the flag is absent. Returns an error message for a flag
 * value that cannot be a prefix.
 */
export function resolveSourcePrefixes(
  parsed: ParsedFlags,
  refData: ReferenceData | undefined,
): { prefixes: readonly string[] } | { error: string } {
  // Read every occurrence: `options` keeps only the last, and this flag is
  // meant to be repeated.
  const fromFlags = parsed.optionsAll.get("source-prefix");
  if (fromFlags === undefined) return { prefixes: refData?.sourcePrefixes ?? [] };
  for (const prefix of fromFlags) {
    // `--source-prefix=` parses as an empty value, which no first path segment
    // can equal, so the check the caller asked for would run over nothing. A
    // usage error says so rather than reporting a clean corpus.
    if (prefix === "") {
      return { error: "--source-prefix takes a directory name, not an empty value" };
    }
    const error = sourcePrefixError(prefix);
    if (error !== undefined) {
      return {
        error: `--source-prefix takes one repo-relative directory, but ${prefix} ${error}`,
      };
    }
  }
  return { prefixes: fromFlags };
}
