import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The test-perspective skill tells an agent how to write TPLs that the CLI
// accepts. These checks fail a PR that adds a config key or subcommand, renames
// a flag the skill names, or changes a default, without updating the skill (#39).
// They see names and defaults only; a change in what a rule means is left to
// review.

const ROOT = resolve(__dirname, "..");
const read = (path: string): string =>
  readFileSync(resolve(ROOT, path), "utf8").replace(/\r\n/g, "\n");

const SKILL = read("skills/test-perspective/SKILL.md");

interface SchemaProperty {
  default?: unknown;
}
const SCHEMA = JSON.parse(read("src/config.schema.json")) as {
  properties: Record<string, SchemaProperty>;
};
const CONFIG_KEYS = Object.keys(SCHEMA.properties).filter((key) => key !== "$schema");

// Subcommands as the CLI dispatches them: each `case "<name>":` except help.
function subcommands(): string[] {
  return [...read("src/cli/index.ts").matchAll(/case "([a-z][a-z-]*)":/g)]
    .map((m) => m[1] as string)
    .filter((sub) => sub !== "help");
}

// Lines of the skill's config table, where each key gets its own row.
const CONFIG_ROWS = SKILL.split("\n").filter((line) => line.startsWith("| `"));

// Every flag the skill tells an agent to pass must be one the CLI defines.
// `--version` is named only to say the CLI does not have it.
const CLI_SOURCE = readdirSync(resolve(ROOT, "src/cli"))
  .map((file) => read(`src/cli/${file}`))
  .join("\n");
const SKILL_FLAGS = [...new Set([...SKILL.matchAll(/--[a-z][a-z-]*/g)].map((m) => m[0]))].filter(
  (flag) => flag !== "--version",
);

// A default as the skill writes it: a string bare, anything else as JSON.
function renderDefault(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

describe("test-perspective skill", () => {
  it("reads the subcommand list from the CLI dispatcher", () => {
    expect(subcommands()).toContain("validate");
  });

  it.each(CONFIG_KEYS)("has a config table row for %s", (key) => {
    expect(CONFIG_ROWS.some((row) => row.includes(`\`${key}\``))).toBe(true);
  });

  it.each(subcommands())("names the subcommand tpl %s", (sub) => {
    expect(SKILL).toContain(`tpl ${sub}`);
  });

  const withDefault = CONFIG_KEYS.filter((key) => SCHEMA.properties[key]?.default !== undefined);
  it.each(withDefault)("states the default of %s in its config table row", (key) => {
    const value = `\`${renderDefault(SCHEMA.properties[key]?.default)}\``;
    const rows = CONFIG_ROWS.filter((row) => row.includes(`\`${key}\``));
    expect(rows.some((row) => row.includes(value))).toBe(true);
  });

  it.each(SKILL_FLAGS)("names %s, which the CLI defines", (flag) => {
    expect(CLI_SOURCE).toContain(flag);
  });
});

describe("plugin manifest", () => {
  it("has the same version as package.json", () => {
    const plugin = JSON.parse(read(".claude-plugin/plugin.json")) as { version: string };
    const pkg = JSON.parse(read("package.json")) as { version: string };
    expect(plugin.version).toBe(pkg.version);
  });
});
