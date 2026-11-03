import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, posix, relative, resolve } from "node:path";
import {
  CONFIG_FILENAME,
  loadReferenceData,
  type ReferenceData,
  resolveConfigPath,
} from "../config.ts";
import { findRelated, findRelatedByChangedFiles, formatRelatedAsMarkdown } from "../related.ts";
import { loadAllTpls, type ParsedTpl } from "../validate.ts";
import { parseFlags } from "./args.ts";
import { resolveSourcePrefixes } from "./source-prefixes.ts";

const DEFAULT_LIMIT = 10;

const HELP = `usage: tpl related <topic> [options]
       tpl related --changed-files <path>... [options]
       tpl related --base <ref> [options]

List active TPLs as markdown. With <topic>, every TPL of that topic, ready to
paste into a Design Doc's "Related TPLs" section. With --changed-files or
--base, the TPLs whose body names a changed file (or the source a named test
file covers) or whose scope.paths matches one, most specific first.

Options:
  --package <pkg>      Also require <pkg> in scope.packages (topic only)
  --changed-files      Read the positional arguments as changed files, paths
                       relative to the working directory
  --base <ref>         Use the files changed since <ref>, as
                       \`git diff --name-only <ref>...HEAD\` lists them
  --limit <n>          With --changed-files or --base, list at most <n>
                       (default ${DEFAULT_LIMIT}; 0 lists all)
  --source-prefix <dir>
                       Top-level directory whose paths a TPL body is matched
                       by; repeat for several. Replaces the config's
                       "sourcePrefixes"
  --tpl-dir <path>     TPL directory (default: docs/test-perspectives)
  --config <path>      JSON file holding "topics" (warns when <topic> is outside
                       the vocabulary), "sourcePrefixes", "testFileInfixes"
                       and "checklistHeading". Defaults to ${CONFIG_FILENAME}
                       in CWD when present.
  --path-prefix <p>    Prefix for links in the output (default: docs/test-perspectives/)
  --status             End each line with the enforcement status derived from
                       the TPL's checklist markers. Needs "checklistHeading"
                       in the config.
  -h, --help           Show this help`;

const VALUE_FLAGS = new Set([
  "package",
  "tpl-dir",
  "config",
  "path-prefix",
  "base",
  "limit",
  "source-prefix",
]);

/**
 * A changed file as a body path is written: relative to `cwd`, with `/`
 * separators and no `./`. Without this `./packages/a.ts` would match nothing
 * and the listing would look clean.
 */
function normalizeChangedFile(file: string, cwd: string): string {
  const rel = isAbsolute(file) ? relative(cwd, file) : file;
  return posix.normalize(rel.replaceAll("\\", "/"));
}

/** The files changed since `base`, relative to `cwd`, or an error message. */
function changedSince(base: string, cwd: string): { files: string[] } | { error: string } {
  try {
    // `--relative` makes the paths relative to `cwd`, which is where body
    // paths resolve; `-z` keeps unusual file names intact.
    const out = execFileSync(
      "git",
      ["diff", "--name-only", "--relative", "-z", `${base}...HEAD`, "--"],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { files: out.split("\0").filter((f) => f !== "") };
  } catch (e) {
    const stderr = (e as { stderr?: string }).stderr?.trim();
    return { error: `git diff against ${base} failed${stderr ? `: ${stderr}` : ""}` };
  }
}

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

  const byFiles = parsed.flags.has("changed-files");
  const base = parsed.options.get("base");
  if (byFiles && base !== undefined) {
    process.stderr.write("error: pass either --changed-files or --base, not both\n");
    return 2;
  }
  if (base !== undefined && (base === "" || base.startsWith("-"))) {
    // git would read a leading "-" as an option of its own (`--output=...`
    // writes a file), and no ref starts with one.
    process.stderr.write(`error: --base takes a git ref, got ${JSON.stringify(base)}\n`);
    return 2;
  }
  const byChanges = byFiles || base !== undefined;
  if (base !== undefined && parsed.positional.length > 0) {
    process.stderr.write(
      `error: --base reads the changed files from git, so a <topic> cannot be given too: ${parsed.positional[0]}\n`,
    );
    return 2;
  }
  if (byChanges && parsed.options.has("package")) {
    process.stderr.write("error: --package filters a topic listing; it does not apply here\n");
    return 2;
  }

  const topic = byChanges ? undefined : parsed.positional[0];
  if (!byChanges && !topic) {
    process.stdout.write(`${HELP}\n`);
    process.stderr.write("\nerror: <topic> is required\n");
    return 2;
  }

  let limit = DEFAULT_LIMIT;
  const limitRaw = parsed.options.get("limit");
  if (limitRaw !== undefined) {
    if (!byChanges) {
      process.stderr.write("error: --limit applies to --changed-files and --base\n");
      return 2;
    }
    if (!/^\d+$/.test(limitRaw)) {
      process.stderr.write(`error: --limit takes a whole number, got ${limitRaw}\n`);
      return 2;
    }
    limit = Number(limitRaw);
  }

  const cwd = process.cwd();
  const tplDir = resolve(cwd, parsed.options.get("tpl-dir") ?? "docs/test-perspectives");
  if (!existsSync(tplDir)) {
    process.stderr.write(`error: TPL directory not found: ${tplDir}\n`);
    return 2;
  }

  const cfgPath = resolveConfigPath(parsed.options.get("config"), cwd);
  let refData: ReferenceData | undefined;
  if (cfgPath !== undefined) {
    try {
      refData = loadReferenceData(cfgPath);
    } catch (e) {
      process.stderr.write(`error: ${(e as Error).message}\n`);
      return 2;
    }
    const { topics } = refData;
    if (topic !== undefined && topics.length > 0 && !topics.includes(topic)) {
      process.stderr.write(
        `warning: topic "${topic}" is not in the controlled vocabulary\n` +
          `         (valid: ${topics.join(", ")})\n` +
          `         continuing anyway.\n\n`,
      );
    }
  }

  const wantStatus = parsed.flags.has("status");
  if (wantStatus && refData?.checklistHeading === undefined) {
    process.stderr.write(
      'error: --status derives the status from checklist markers, which needs "checklistHeading" in the config\n',
    );
    return 2;
  }

  const pathPrefix = parsed.options.get("path-prefix");
  const format = (matched: readonly ParsedTpl[], matchedFiles?: Map<string, string[]>): string =>
    formatRelatedAsMarkdown(matched, {
      ...(pathPrefix ? { pathPrefix } : {}),
      ...(wantStatus ? { statusHeading: refData?.checklistHeading } : {}),
      ...(matchedFiles ? { matchedFiles } : {}),
    });

  if (topic !== undefined) {
    const pkg = parsed.options.get("package");
    const matched = findRelated(loadAllTpls(tplDir), { topic, pkg });
    if (matched.length === 0) {
      process.stderr.write(
        `No active TPLs found for topic "${topic}"${pkg ? ` and package "${pkg}"` : ""}.\n`,
      );
      return 0;
    }
    process.stdout.write(`${format(matched)}\n`);
    return 0;
  }

  const resolved = resolveSourcePrefixes(parsed, refData);
  if ("error" in resolved) {
    process.stderr.write(`error: ${resolved.error}\n`);
    return 2;
  }
  if (resolved.prefixes.length === 0) {
    // Without a prefix no body path counts, so every TPL that names files
    // would silently drop out and the listing would look clean.
    process.stderr.write(
      'error: matching changed files reads the paths TPL bodies name, which needs "sourcePrefixes" in the config or --source-prefix\n',
    );
    return 2;
  }

  let changed: string[];
  if (base !== undefined) {
    const diff = changedSince(base, cwd);
    if ("error" in diff) {
      process.stderr.write(`error: ${diff.error}\n`);
      return 2;
    }
    changed = diff.files;
  } else {
    changed = parsed.positional.map((f) => normalizeChangedFile(f, cwd));
  }
  if (changed.length === 0) {
    process.stderr.write("No changed files, so no TPL to list.\n");
    return 0;
  }

  const matches = findRelatedByChangedFiles(loadAllTpls(tplDir), changed, {
    sourcePrefixes: resolved.prefixes,
    repoRoot: cwd,
    ...(refData?.testFileInfixes === undefined ? {} : { testFileInfixes: refData.testFileInfixes }),
  });
  if (matches.length === 0) {
    process.stderr.write("No active TPL names a changed file.\n");
    return 0;
  }
  const shown = limit === 0 ? matches : matches.slice(0, limit);
  const matchedFiles = new Map(shown.map((m) => [m.tpl.fm.id, m.files]));
  process.stdout.write(
    `${format(
      shown.map((m) => m.tpl),
      matchedFiles,
    )}\n`,
  );
  if (shown.length < matches.length) {
    process.stdout.write(
      `\n${matches.length - shown.length} more of ${matches.length}; pass --limit 0 to list all.\n`,
    );
  }
  return 0;
}
