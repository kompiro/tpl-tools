import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderReviewBody } from "../review-body.ts";
import { parseFlags } from "./args.ts";

const HELP = `usage: tpl review-body [options]

Print the markdown body for a periodic TPL deprecation-review Issue to stdout.

Options:
  --tpl-dir <path>          TPL directory (default: docs/test-perspectives)
  --repo <owner/repo>       Repo for blob links (default: $GITHUB_REPOSITORY)
  --tpl-dir-relative <p>    Repo-root relative TPL path used in links/prose
                            (default: docs/test-perspectives)
  -h, --help                Show this help`;

const VALUE_FLAGS = new Set(["tpl-dir", "repo", "tpl-dir-relative"]);

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
  const tplDirRelative = parsed.options.get("tpl-dir-relative") ?? "docs/test-perspectives";
  const tplDir = resolve(cwd, parsed.options.get("tpl-dir") ?? tplDirRelative);
  if (!existsSync(tplDir)) {
    process.stderr.write(`error: TPL directory not found: ${tplDir}\n`);
    return 2;
  }

  const repo = parsed.options.get("repo") ?? process.env.GITHUB_REPOSITORY;
  if (!repo) {
    process.stderr.write("error: --repo <owner/repo> is required (or set GITHUB_REPOSITORY)\n");
    return 2;
  }

  process.stdout.write(renderReviewBody({ tplDir, repo, tplDirRelative }));
  return 0;
}
