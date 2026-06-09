#!/usr/bin/env node
import { main as runInit } from "./init.ts";
import { main as runRelated } from "./related.ts";
import { main as runReviewBody } from "./review-body.ts";
import { main as runValidate } from "./validate.ts";

const HELP = `usage: tpl <subcommand> [options]

Subcommands:
  init           generate a starter tpl.config.json in the target dir (or CWD)
  validate       validate TPL frontmatter, filenames, cross-refs, README index
  related        list active TPLs matching a topic (markdown for Design Docs)
  review-body    print the body for a periodic TPL deprecation-review Issue

Run \`tpl <subcommand> --help\` for subcommand-specific options.`;

function main(): number {
  const sub = process.argv[2];
  // Hand each handler an argv shaped like [node, "tpl <sub>", ...args];
  // handlers slice(2) to get their own arguments.
  const subArgv = [process.argv[0] ?? "node", `tpl ${sub}`, ...process.argv.slice(3)];
  switch (sub) {
    case undefined:
      process.stdout.write(`${HELP}\n`);
      return 1;
    case "-h":
    case "--help":
    case "help":
      process.stdout.write(`${HELP}\n`);
      return 0;
    case "init":
      return runInit(subArgv);
    case "validate":
      return runValidate(subArgv);
    case "related":
      return runRelated(subArgv);
    case "review-body":
      return runReviewBody(subArgv);
    default:
      process.stderr.write(`unknown subcommand: ${sub}\n\n${HELP}\n`);
      return 2;
  }
}

process.exit(main());
