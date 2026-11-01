import { formatStatus, statusOf } from "./checklist.ts";
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
      return `- [${p.fm.id}](${prefix}${p.file}) — ${p.fm.title}${status}`;
    })
    .join("\n");
}
