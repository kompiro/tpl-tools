import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  CONFIG_FILENAME,
  loadReferenceData,
  type ReferenceData,
  resolveConfigPath,
} from "../config.ts";
import { renderIndex } from "../regenerate.ts";
import { loadAllTpls } from "../validate.ts";
import { parseFlags } from "./args.ts";

const HELP = `usage: tpl regenerate [options]

Write the TPL index named by "indexFile" in the config: every TPL, grouped by
topic. Re-run it after adding or editing a TPL, and to resolve a merge conflict
in the index.

Options:
  --check            Write nothing; exit 1 when the index is missing or stale
  --tpl-dir <path>   TPL directory (default: docs/test-perspectives)
  --config <path>    JSON file holding "indexFile" (required) and "topics"
                     (section order). Defaults to ${CONFIG_FILENAME} in CWD
                     when present.
  -h, --help         Show this help`;

const VALUE_FLAGS = new Set(["tpl-dir", "config"]);

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

  let refData: ReferenceData;
  try {
    refData = loadReferenceData(resolveConfigPath(parsed.options.get("config"), cwd));
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    return 2;
  }
  // No default file name: `tpl validate` checks whichever file the config
  // names, so a default here would let the two commands look at different
  // files.
  if (refData.indexFile === undefined) {
    process.stderr.write(
      `error: no "indexFile" in the config. Set it (e.g. "index.md") so that\n` +
        `       tpl validate checks the same file this command writes.\n`,
    );
    return 2;
  }

  const indexPath = join(tplDir, refData.indexFile);
  const rel = relative(cwd, indexPath);
  const shown = rel.startsWith("..") ? indexPath : rel;
  const expected = renderIndex(loadAllTpls(tplDir), {
    topics: refData.topics,
    tplDir,
    indexPath,
  });
  const current = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : undefined;

  if (parsed.flags.has("check")) {
    if (current === expected) {
      process.stdout.write(`${shown} is up to date.\n`);
      return 0;
    }
    process.stderr.write(
      `${shown} is ${current === undefined ? "missing" : "out of date"}; run \`tpl regenerate\`.\n`,
    );
    return 1;
  }

  if (current === expected) {
    process.stdout.write(`${shown} is up to date.\n`);
    return 0;
  }
  writeFileSync(indexPath, expected);
  process.stdout.write(`Wrote ${shown}.\n`);
  return 0;
}
