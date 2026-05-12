/** Minimal flag parser shared by the subcommands. */

export interface ParsedFlags {
  options: Map<string, string>;
  flags: Set<string>;
  positional: string[];
}

/**
 * Parse `--key value`, `--key=value`, bare `--flag`, and positional args.
 * `valueFlags` is the set of flag names that take a value; anything else
 * starting with `--` is treated as a boolean flag.
 */
export function parseFlags(argv: readonly string[], valueFlags: ReadonlySet<string>): ParsedFlags {
  const options = new Map<string, string>();
  const flags = new Set<string>();
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        options.set(arg.slice(2, eq), arg.slice(eq + 1));
        continue;
      }
      const name = arg.slice(2);
      if (valueFlags.has(name)) {
        const next = argv[++i];
        if (next === undefined) {
          throw new Error(`flag --${name} requires a value`);
        }
        options.set(name, next);
      } else {
        flags.add(name);
      }
      continue;
    }
    positional.push(arg);
  }

  return { options, flags, positional };
}
