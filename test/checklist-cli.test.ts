import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main as checklistCli } from "../src/cli/checklist.ts";
import { main as regenerateCli } from "../src/cli/regenerate.ts";
import { main as relatedCli } from "../src/cli/related.ts";
import { main as reviewBodyCli } from "../src/cli/review-body.ts";
import { main as validateCli } from "../src/cli/validate.ts";

// The commands that read checklist markers, end to end against a temp repo.
// Each TPL below has a different status, so one corpus covers all four.

const DIR = "docs/test-perspectives";

function tpl(n: number, items: string, status = "active"): string {
  return [
    "---",
    `id: TPL-${n}`,
    `title: "perspective ${n}"`,
    `status: ${status}`,
    "date: 2026-11-01",
    "applicable_to:",
    '  - "pattern"',
    "discovered_from:",
    `  - issue: "#${n}"`,
    "related_to: []",
    "topic: testing",
    "scope:",
    "  packages: []",
    "---",
    "",
    `# TPL-${n}: perspective ${n}`,
    "",
    "## Checklist",
    "",
    items,
    "",
    ...(status === "deprecated" ? ["deprecated: superseded"] : []),
  ].join("\n");
}

const G = "[guard: `packages/core/a.test.ts`]";

describe("commands reading checklist markers", () => {
  let root: string;
  let out: string;
  let err: string;

  const writeConfig = (cfg: object) =>
    writeFileSync(
      join(root, "tpl.config.json"),
      JSON.stringify({ idFormat: "issue-number", ...cfg }),
    );

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tpl-checklist-cli-"));
    mkdirSync(join(root, "packages/core"), { recursive: true });
    writeFileSync(join(root, "packages/core/a.test.ts"), "");
    mkdirSync(join(root, DIR), { recursive: true });
    const files: Record<string, string> = {
      "TPL-1-guarded.md": tpl(1, `- [ ] a ${G}\n- [ ] b [judgment]`),
      "TPL-2-partial.md": tpl(2, `- [ ] a ${G}\n- [ ] b`),
      "TPL-3-unguarded.md": tpl(3, "- [ ] a\n- [ ] b [judgment]."),
      "TPL-4-judgment.md": tpl(4, "- [ ] a [judgment]"),
      "TPL-5-old.md": tpl(5, "- [ ] a", "deprecated"),
    };
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(root, DIR, name), content);
    }
    writeFileSync(
      join(root, DIR, "README.md"),
      Object.keys(files)
        .map((f) => `- [${f.split("-").slice(0, 2).join("-")}](${f})`)
        .join("\n"),
    );
    writeConfig({ checklistHeading: "Checklist", indexFile: "index.md" });

    out = "";
    err = "";
    vi.spyOn(process, "cwd").mockReturnValue(root);
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
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  describe("tpl validate", () => {
    const run = (...args: string[]) => validateCli(["node", "tpl", ...args]);

    it("is a usage error without a source prefix, since guards would go unchecked", () => {
      expect(run()).toBe(2);
      expect(err).toContain("--source-prefix");
    });

    it("reports the malformed marker with its file and line", () => {
      regenerateCli(["node", "tpl"]);
      expect(run("--source-prefix", "packages")).toBe(1);
      expect(err).toMatch(/TPL-3-unguarded\.md:21: malformed checklist marker/);
      expect(err).toContain("1 finding(s)");
    });

    it("reports a TPL without the checklist section", () => {
      writeFileSync(
        join(root, DIR, "TPL-4-judgment.md"),
        tpl(4, "").replace("## Checklist", "## Steps"),
      );
      regenerateCli(["node", "tpl"]);
      run("--source-prefix", "packages");
      expect(err).toContain('TPL-4-judgment.md: no "Checklist" heading');
    });

    it("checks nothing new when checklistHeading is unset", () => {
      writeConfig({});
      expect(run()).toBe(0);
    });
  });

  describe("tpl regenerate", () => {
    it("ends each active entry with its status, and leaves deprecated ones bare", () => {
      expect(regenerateCli(["node", "tpl"])).toBe(0);
      const index = readFileSync(join(root, DIR, "index.md"), "utf8");
      expect(index).toContain("— perspective 1 (#1) · guarded 1/1, judgment 1");
      expect(index).toContain("— perspective 2 (#2) · partial 1/2");
      expect(index).toContain("— perspective 3 (#3) · unguarded 0/2");
      expect(index).toContain("— perspective 4 (#4) · judgment 1");
      expect(index).toMatch(/— perspective 5 \(#5\)\n/);
    });
  });

  describe("tpl related", () => {
    const run = (...args: string[]) => relatedCli(["node", "tpl", "testing", ...args]);

    it("prints no status by default", () => {
      expect(run()).toBe(0);
      expect(out).not.toContain(" · ");
    });

    it("prints the status with --status", () => {
      expect(run("--status")).toBe(0);
      expect(out).toContain("— perspective 2 · partial 1/2");
    });

    it("is a usage error to ask for --status without checklistHeading", () => {
      writeConfig({});
      expect(run("--status")).toBe(2);
      expect(err).toContain("checklistHeading");
    });
  });

  describe("tpl checklist", () => {
    const run = (...args: string[]) => checklistCli(["node", "tpl", ...args]);

    it("lists every active item, tab-separated", () => {
      expect(run()).toBe(0);
      const lines = out.trimEnd().split("\n");
      expect(lines).toContain("TPL-1\t1\tguard\tpackages/core/a.test.ts\ta");
      expect(lines).toContain("TPL-3\t2\tmalformed\t-\tb [judgment].");
      expect(out).not.toContain("TPL-5");
    });

    it("filters by marker, counting malformed as unguarded", () => {
      expect(run("--marker", "unguarded")).toBe(0);
      expect(
        out
          .trimEnd()
          .split("\n")
          .map((l) => l.split("\t").slice(0, 3).join(" ")),
      ).toEqual(["TPL-2 2 unguarded", "TPL-3 1 unguarded", "TPL-3 2 malformed"]);
    });

    it("rejects an unknown marker", () => {
      expect(run("--marker", "manual")).toBe(2);
    });

    it("is a usage error without checklistHeading", () => {
      writeConfig({});
      expect(run()).toBe(2);
    });
  });

  describe("tpl review-body", () => {
    const run = (...args: string[]) =>
      reviewBodyCli(["node", "tpl", "--repo", "o/r", "--period-label", "2026-11", ...args]);

    it("groups the active TPLs by status, each under its question", () => {
      expect(run()).toBe(0);
      const headings = out.split("\n").filter((l) => l.startsWith("### "));
      expect(headings).toEqual([
        "### unguarded (1)",
        "### partial (1)",
        "### guarded (1)",
        "### judgment (1)",
      ]);
      const guarded = out.slice(out.indexOf("### guarded"));
      expect(guarded).toMatch(
        /^### guarded \(1\)\n\n> Every checkable item has a guard\. Can the checklist be thinned/,
      );
      expect(out).toContain("perspective 2 _(topic: `testing`)_ · partial 1/2");
    });

    it("keeps the flat list when checklistHeading is unset", () => {
      writeConfig({});
      expect(run()).toBe(0);
      expect(out).not.toContain("### ");
      expect(out).not.toContain(" · ");
    });
  });
});
