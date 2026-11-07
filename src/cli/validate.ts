import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CONFIG_FILENAME,
  loadReferenceData,
  type ReferenceData,
  resolveConfigPath,
} from "../config.ts";
import { formatFinding, validateAll } from "../validate.ts";
import { parseFlags } from "./args.ts";
import { resolveSourcePrefixes } from "./source-prefixes.ts";

const HELP = `usage: tpl validate [options]

Validate TPL frontmatter, filename conventions, cross-references, that each
scope.paths glob matches a file, and the index: the file named by "indexFile"
in the config, or README.md without it.
"indexCheck": false in the config skips the index check.

Options:
  --tpl-dir <path>         TPL directory (default: docs/test-perspectives)
  --config <path>          JSON file holding "topics" (controlled vocabulary,
                           optional), "idFormat" ("date-sequence" |
                           "issue-number", default "date-sequence"),
                           "indexFile" (the generated index to check instead
                           of README.md, optional), "indexCheck" (false
                           skips the index check, optional) and
                           "checklistHeading" (the checklist section whose
                           item markers are checked, optional; needs source
                           prefixes) and "sourcePrefixes" (see
                           --source-prefix, optional).
                           Defaults to ${CONFIG_FILENAME} in CWD when present;
                           omit and provide no ${CONFIG_FILENAME} to skip topic
                           validation and use the default id format.
  --packages-root <path>   Directory whose subdirectories are the allowed
                           values for scope.packages. Omit to skip the
                           scope.packages check.
  --source-prefix <dir>    Repo-relative directory holding source. A code span in a
                           TPL body is checked against the working tree when
                           its first path segment is one of these. Repeat the
                           flag for several (--source-prefix packages
                           --source-prefix scripts). Replaces the config's
                           "sourcePrefixes". Paths resolve relative to the
                           working directory. With neither, the check is
                           skipped.
  -h, --help               Show this help`;

const VALUE_FLAGS = new Set(["tpl-dir", "config", "packages-root", "source-prefix"]);

export function main(argv: readonly string[]): number {
  let parsed: ReturnType<typeof parseFlags>;
  try {
    parsed = parseFlags(argv.slice(2), VALUE_FLAGS);
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    return 2;
  }
  if (parsed.flags.has("help") || parsed.flags.has("h")) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const cwd = process.cwd();
  const tplDir = resolve(cwd, parsed.options.get("tpl-dir") ?? "docs/test-perspectives");
  if (!existsSync(tplDir)) {
    process.stderr.write(`error: TPL directory not found: ${tplDir}\n`);
    return 2;
  }
  const readmePath = join(tplDir, "README.md");

  let refData: ReferenceData;
  try {
    refData = loadReferenceData(resolveConfigPath(parsed.options.get("config"), cwd));
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    return 2;
  }

  let validPackages: readonly string[] | null = null;
  if (parsed.options.has("packages-root")) {
    const root = resolve(cwd, parsed.options.get("packages-root")!);
    validPackages = existsSync(root)
      ? readdirSync(root).filter((name) => statSync(join(root, name)).isDirectory())
      : [];
  }

  const resolved = resolveSourcePrefixes(parsed, refData);
  if ("error" in resolved) {
    process.stderr.write(`error: ${resolved.error}\n`);
    return 2;
  }
  const sourcePrefixes = resolved.prefixes;

  if (refData.checklistHeading !== undefined && sourcePrefixes.length === 0) {
    process.stderr.write(
      'error: "checklistHeading" is set, so guard paths must be checked: set "sourcePrefixes" in the config or pass --source-prefix for each top-level directory a guard may name\n',
    );
    return 2;
  }

  // With the index check off, neither path is passed: passing only the README
  // would bring back the README table check the config turned off.
  const index =
    refData.indexCheck === false
      ? {}
      : refData.indexFile === undefined
        ? { readmePath }
        : { readmePath, indexPath: join(tplDir, refData.indexFile) };
  const { findings, parsed: tpls } = validateAll({
    tplDir,
    validTopics: refData.topics,
    validPackages,
    ...index,
    idFormat: refData.idFormat,
    ...(refData.checklistHeading === undefined
      ? {}
      : { checklistHeading: refData.checklistHeading }),
    sourcePrefixes,
    repoRoot: cwd,
  });

  if (findings.length === 0) {
    process.stdout.write(`Validated ${tpls.length} TPL(s).\n`);
    return 0;
  }
  for (const f of findings) {
    process.stderr.write(`${formatFinding(f)}\n`);
  }
  process.stderr.write(`\n${findings.length} finding(s) across ${tpls.length} TPL(s).\n`);
  return 1;
}
