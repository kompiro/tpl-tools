import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The test-perspective skill tells an agent how to write TPLs that the CLI
// accepts. These checks fail a PR that adds a config key or subcommand, or
// changes a default, without updating the skill (#39). They see names and
// defaults only; a change in what a rule means is left to review.

const ROOT = resolve(__dirname, "..");
const read = (path: string): string => readFileSync(resolve(ROOT, path), "utf8");

const SKILL = read("skills/test-perspective/SKILL.md");

interface SchemaProperty {
  default?: unknown;
}
const SCHEMA = JSON.parse(read("src/config.schema.json")) as {
  properties: Record<string, SchemaProperty>;
};
const CONFIG_KEYS = Object.keys(SCHEMA.properties).filter((key) => key !== "$schema");

// Subcommands as listed in the CLI's help text, one per line under "Subcommands:".
function subcommands(): string[] {
  const help = read("src/cli/index.ts").split("Subcommands:\n")[1]?.split("\n\n")[0] ?? "";
  return [...help.matchAll(/^ {2}([a-z][a-z-]*) {2,}/gm)].map((m) => m[1] as string);
}

// A default as the skill writes it: a string bare, anything else as JSON.
function renderDefault(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

describe("test-perspective skill", () => {
  it("reads the subcommand list from the CLI help", () => {
    expect(subcommands()).toContain("validate");
  });

  it.each(CONFIG_KEYS)("names the config key %s", (key) => {
    expect(SKILL).toContain(`\`${key}\``);
  });

  it.each(subcommands())("names the subcommand tpl %s", (sub) => {
    expect(SKILL).toContain(`tpl ${sub}`);
  });

  const withDefault = CONFIG_KEYS.filter((key) => SCHEMA.properties[key]?.default !== undefined);
  it.each(withDefault)("states the default of %s on a line naming the key", (key) => {
    const value = `\`${renderDefault(SCHEMA.properties[key]?.default)}\``;
    const lines = SKILL.split("\n").filter((line) => line.includes(`\`${key}\``));
    expect(lines.some((line) => line.includes(value))).toBe(true);
  });
});

describe("plugin manifest", () => {
  it("has the same version as package.json", () => {
    const plugin = JSON.parse(read(".claude-plugin/plugin.json")) as { version: string };
    const pkg = JSON.parse(read("package.json")) as { version: string };
    expect(plugin.version).toBe(pkg.version);
  });
});
