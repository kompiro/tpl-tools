import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadReferenceData, type ReferenceData } from "../config.ts";
import { formatFinding, validateAll } from "../validate.ts";
import { parseFlags } from "./args.ts";

const HELP = `usage: tpl validate [options]

Validate TPL frontmatter, filename conventions, cross-references, and the
README index.

Options:
  --tpl-dir <path>         TPL directory (default: docs/test-perspectives)
  --config <path>          JSON file holding "topics" (controlled vocabulary,
                           optional) and "idFormat" ("date-sequence" |
                           "issue-number", default "date-sequence"). Omit
                           to skip topic validation and use the default id
                           format.
  --packages-root <path>   Directory whose subdirectories are the allowed
                           values for scope.packages. Omit to skip the
                           scope.packages check.
  -h, --help               Show this help`;

const VALUE_FLAGS = new Set(["tpl-dir", "config", "packages-root"]);

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
    refData = loadReferenceData(
      parsed.options.has("config") ? resolve(cwd, parsed.options.get("config")!) : undefined,
    );
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

  const { findings, parsed: tpls } = validateAll({
    tplDir,
    validTopics: refData.topics,
    validPackages,
    readmePath,
    idFormat: refData.idFormat,
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
