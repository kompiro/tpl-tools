import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * Why `indexPath` may not be written, or `undefined` when it may. The config
 * loader already rejects `..` and absolute paths; this catches a symlink on the
 * way. Directories that do not exist yet are created by this command, so the
 * nearest existing one decides where they land.
 */
function unsafeIndexPath(tplDir: string, indexPath: string): string | undefined {
  let anchor = dirname(indexPath);
  while (!existsSync(anchor)) anchor = dirname(anchor);
  if (!isInside(realpathSync(tplDir), realpathSync(anchor))) {
    return "its directory resolves outside the TPL directory";
  }
  try {
    if (lstatSync(indexPath).isSymbolicLink()) return "it is a symlink";
  } catch {
    // Not there yet: nothing to follow.
  }
  return undefined;
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
  const unsafe = unsafeIndexPath(tplDir, indexPath);
  if (unsafe !== undefined) {
    process.stderr.write(`error: refusing to use "indexFile" ${refData.indexFile}: ${unsafe}\n`);
    return 2;
  }
  const rel = relative(cwd, indexPath);
  const shown = rel.startsWith("..") ? indexPath : rel;
  const expected = renderIndex(loadAllTpls(tplDir), {
    topics: refData.topics,
    tplDir,
    indexPath,
  });
  // Compare with LF line endings: a Windows checkout under core.autocrlf
  // holds CRLF, and that alone does not make the index stale.
  let current: string | undefined;
  try {
    current = existsSync(indexPath)
      ? readFileSync(indexPath, "utf8").replace(/\r\n/g, "\n")
      : undefined;
  } catch (e) {
    process.stderr.write(`error: cannot read ${shown}: ${(e as Error).message}\n`);
    return 2;
  }

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
  try {
    mkdirSync(dirname(indexPath), { recursive: true });
    writeFileSync(indexPath, expected);
  } catch (e) {
    process.stderr.write(`error: cannot write ${shown}: ${(e as Error).message}\n`);
    return 2;
  }
  process.stdout.write(`Wrote ${shown}.\n`);
  return 0;
}
