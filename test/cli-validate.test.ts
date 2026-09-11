import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main as validateCli } from "../src/cli/validate.ts";
import { parseFlags } from "../src/cli/args.ts";

describe("parseFlags", () => {
  const VALUE_FLAGS = new Set(["source-prefix", "tpl-dir"]);

  it("keeps every occurrence of a repeated value flag", () => {
    const parsed = parseFlags(
      ["--source-prefix", "packages", "--source-prefix", "scripts"],
      VALUE_FLAGS,
    );
    expect(parsed.optionsAll.get("source-prefix")).toEqual(["packages", "scripts"]);
  });

  it("keeps the last occurrence in options, so single-valued flags are unchanged", () => {
    const parsed = parseFlags(["--tpl-dir", "a", "--tpl-dir", "b"], VALUE_FLAGS);
    expect(parsed.options.get("tpl-dir")).toBe("b");
  });

  it("records the --key=value form too", () => {
    const parsed = parseFlags(["--source-prefix=packages", "--source-prefix=lib"], VALUE_FLAGS);
    expect(parsed.optionsAll.get("source-prefix")).toEqual(["packages", "lib"]);
  });
});

describe("validate CLI --source-prefix", () => {
  let root: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let out: string;
  let err: string;

  const TPL = (body: string) =>
    [
      "---",
      "id: TPL-20260907-01",
      'title: "perspective"',
      "status: active",
      "date: 2026-09-07",
      "applicable_to:",
      '  - "pattern"',
      "discovered_from:",
      '  - issue: "#1"',
      "related_to: []",
      "topic: testing",
      "scope:",
      "  packages: []",
      "---",
      "",
      "# TPL-20260907-01: perspective",
      "",
      body,
      "",
    ].join("\n");

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tpl-cli-validate-"));
    mkdirSync(join(root, "packages/core/src"), { recursive: true });
    writeFileSync(join(root, "packages/core/src/live.ts"), "export {};\n");
    mkdirSync(join(root, "docs/test-perspectives"), { recursive: true });
    writeFileSync(
      join(root, "docs/test-perspectives/README.md"),
      "# TPL\n\n| ID | タイトル |\n|---|---|\n| [TPL-20260907-01](TPL-20260907-01-perspective.md) | perspective |\n",
    );

    out = "";
    err = "";
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      out += String(c);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((c) => {
      err += String(c);
      return true;
    });
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  const writeTpl = (body: string) =>
    writeFileSync(join(root, "docs/test-perspectives/TPL-20260907-01-perspective.md"), TPL(body));

  const run = (args: string[]) => validateCli(["node", "tpl", ...args]);

  it("passes a dead path when the flag is not given, so the check is opt-in", () => {
    writeTpl("- `packages/core/src/gone.ts` covers it");
    expect(run([])).toBe(0);
    expect(out).toContain("Validated 1 TPL(s).");
  });

  it("reports the dead path when the prefix is given", () => {
    writeTpl("- `packages/core/src/gone.ts` covers it");
    expect(run(["--source-prefix", "packages"])).toBe(1);
    expect(err).toContain("packages/core/src/gone.ts` does not exist");
  });

  it("honours every prefix when the flag is repeated", () => {
    writeTpl("- `packages/core/src/live.ts` and `scripts/gen.ts`");
    expect(run(["--source-prefix", "packages", "--source-prefix", "scripts"])).toBe(1);
    // The first prefix must not be lost when the second is parsed, and only
    // the genuinely absent path is reported.
    expect(err).toContain("scripts/gen.ts` does not exist");
    expect(err).not.toContain("live.ts");
  });

  it("passes when every named path resolves", () => {
    writeTpl("- `packages/core/src/live.ts` covers it");
    expect(run(["--source-prefix", "packages"])).toBe(0);
    expect(out).toContain("Validated 1 TPL(s).");
  });

  it("rejects a prefix that is a path rather than a directory name", () => {
    writeTpl("- nothing here");
    expect(run(["--source-prefix", "packages/core"])).toBe(2);
    expect(err).toContain("takes one top-level directory name");
  });

  it("rejects an empty prefix, which would turn the requested check off", () => {
    writeTpl("- `packages/core/src/gone.ts` covers it");
    expect(run(["--source-prefix="])).toBe(2);
    expect(err).toContain("not an empty value");
  });
});
