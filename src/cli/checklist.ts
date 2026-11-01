import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { checklistRows, type RowMarker } from "../checklist.ts";
import { CONFIG_FILENAME, loadReferenceData, resolveConfigPath } from "../config.ts";
import { loadAllTpls } from "../validate.ts";
import { parseFlags } from "./args.ts";

const HELP = `usage: tpl checklist [options]

List the checklist items of every active TPL with the marker each one carries,
one tab-separated line per item:

  <id>  <item number>  <marker>  <guard paths, comma-separated, or ->  <text>

<marker> is guard, judgment, unguarded (no marker), or malformed (a marker
\`tpl validate\` rejects; it counts as unguarded). Needs "checklistHeading" in
the config.

Options:
  --marker <m>       Only items with this marker: guard | judgment | unguarded
                     (unguarded includes malformed). Repeat for several.
  --topic <topic>    Only TPLs with this topic
  --tpl-dir <path>   TPL directory (default: docs/test-perspectives)
  --config <path>    JSON file holding "checklistHeading". Defaults to
                     ${CONFIG_FILENAME} in CWD when present.
  -h, --help         Show this help`;

const VALUE_FLAGS = new Set(["marker", "topic", "tpl-dir", "config"]);
const FILTERS = ["guard", "judgment", "unguarded"] as const;

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

  const filters = parsed.optionsAll.get("marker") ?? [];
  for (const f of filters) {
    if (!(FILTERS as readonly string[]).includes(f)) {
      process.stderr.write(`error: --marker takes one of ${FILTERS.join(" | ")}, got ${f}\n`);
      return 2;
    }
  }
  const wanted = new Set<RowMarker>(filters as RowMarker[]);
  if (wanted.has("unguarded")) wanted.add("malformed");

  const cwd = process.cwd();
  const tplDir = resolve(cwd, parsed.options.get("tpl-dir") ?? "docs/test-perspectives");
  if (!existsSync(tplDir)) {
    process.stderr.write(`error: TPL directory not found: ${tplDir}\n`);
    return 2;
  }

  let heading: string | undefined;
  try {
    heading = loadReferenceData(
      resolveConfigPath(parsed.options.get("config"), cwd),
    ).checklistHeading;
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    return 2;
  }
  if (heading === undefined) {
    process.stderr.write('error: tpl checklist needs "checklistHeading" in the config\n');
    return 2;
  }

  const topic = parsed.options.get("topic");
  const tpls = loadAllTpls(tplDir).filter(
    (t) => t.fm.status === "active" && (topic === undefined || t.fm.topic === topic),
  );
  for (const row of checklistRows(tpls, heading)) {
    if (wanted.size > 0 && !wanted.has(row.marker)) continue;
    const guards = row.guards.length > 0 ? row.guards.join(",") : "-";
    process.stdout.write(`${row.id}\t${row.n}\t${row.marker}\t${guards}\t${row.text}\n`);
  }
  return 0;
}
