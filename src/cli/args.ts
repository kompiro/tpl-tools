/** Minimal flag parser shared by the subcommands. */

export interface ParsedFlags {
  /** Last value seen for each value flag. */
  options: Map<string, string>;
  /**
   * Every value seen for each value flag, in order. `options` keeps only the
   * last, which is what a flag naming one thing wants; a flag that may be
   * repeated (`--source-prefix packages --source-prefix scripts`) reads this
   * instead, so the earlier occurrences are not silently dropped.
   */
  optionsAll: Map<string, string[]>;
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
  const optionsAll = new Map<string, string[]>();
  const flags = new Set<string>();
  const positional: string[] = [];

  const record = (name: string, value: string): void => {
    options.set(name, value);
    const seen = optionsAll.get(name);
    if (seen === undefined) optionsAll.set(name, [value]);
    else seen.push(value);
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        record(arg.slice(2, eq), arg.slice(eq + 1));
        continue;
      }
      const name = arg.slice(2);
      if (valueFlags.has(name)) {
        const next = argv[++i];
        if (next === undefined) {
          throw new Error(`flag --${name} requires a value`);
        }
        record(name, next);
      } else {
        flags.add(name);
      }
      continue;
    }
    positional.push(arg);
  }

  return { options, optionsAll, flags, positional };
}
