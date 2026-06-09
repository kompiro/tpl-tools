import { runInit } from "../init.ts";
import { parseFlags } from "./args.ts";

const HELP = `usage: tpl init [dir]

Generate a starter tpl.config.json in the target directory (default: CWD).
Defines "topics" (controlled vocabulary) and "idFormat". Refuses to overwrite
an existing file.

Options:
  -h, --help   Show this help`;

export function main(argv: readonly string[]): number {
  let parsed: ReturnType<typeof parseFlags>;
  try {
    parsed = parseFlags(argv.slice(2), new Set());
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    return 2;
  }
  if (parsed.flags.has("help") || parsed.flags.has("h")) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const result = runInit(parsed.positional[0] ?? process.cwd());
  if (!result.written) {
    process.stderr.write(`${result.message}\n`);
    return 1;
  }
  process.stdout.write(`${result.message}\n`);
  return 0;
}
