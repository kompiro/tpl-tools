import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { CONFIG_FILENAME, loadReferenceData, resolveConfigPath } from "../config.ts";
import { findRelated, formatRelatedAsMarkdown } from "../related.ts";
import { loadAllTpls } from "../validate.ts";
import { parseFlags } from "./args.ts";

const HELP = `usage: tpl related <topic> [options]

List active TPLs matching the given topic (and optionally package). Output is
markdown ready to paste into a Design Doc's "Related TPLs" section.

Options:
  --package <pkg>      Also require <pkg> in scope.packages
  --tpl-dir <path>     TPL directory (default: docs/test-perspectives)
  --config <path>      JSON file holding a "topics" array; used only to warn
                       when <topic> is outside the controlled vocabulary.
                       Defaults to ${CONFIG_FILENAME} in CWD when present.
  --path-prefix <p>    Prefix for links in the output (default: docs/test-perspectives/)
  -h, --help           Show this help`;

const VALUE_FLAGS = new Set(["package", "tpl-dir", "config", "path-prefix"]);

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

  const topic = parsed.positional[0];
  if (!topic) {
    process.stdout.write(`${HELP}\n`);
    process.stderr.write("\nerror: <topic> is required\n");
    return 2;
  }

  const cwd = process.cwd();
  const tplDir = resolve(cwd, parsed.options.get("tpl-dir") ?? "docs/test-perspectives");
  if (!existsSync(tplDir)) {
    process.stderr.write(`error: TPL directory not found: ${tplDir}\n`);
    return 2;
  }

  const cfgPath = resolveConfigPath(parsed.options.get("config"), cwd);
  if (cfgPath !== undefined) {
    let topics: readonly string[];
    try {
      topics = loadReferenceData(cfgPath).topics;
    } catch (e) {
      process.stderr.write(`error: ${(e as Error).message}\n`);
      return 2;
    }
    if (topics.length > 0 && !topics.includes(topic)) {
      process.stderr.write(
        `warning: topic "${topic}" is not in the controlled vocabulary\n` +
          `         (valid: ${topics.join(", ")})\n` +
          `         continuing anyway.\n\n`,
      );
    }
  }

  const pkg = parsed.options.get("package");
  const matched = findRelated(loadAllTpls(tplDir), { topic, pkg });
  if (matched.length === 0) {
    process.stderr.write(
      `No active TPLs found for topic "${topic}"${pkg ? ` and package "${pkg}"` : ""}.\n`,
    );
    return 0;
  }
  const pathPrefix = parsed.options.get("path-prefix");
  process.stdout.write(`${formatRelatedAsMarkdown(matched, pathPrefix ? { pathPrefix } : {})}\n`);
  return 0;
}
