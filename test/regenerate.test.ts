import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main as regenerateCli } from "../src/cli/regenerate.ts";
import { main as validateCli } from "../src/cli/validate.ts";
import { renderIndex } from "../src/regenerate.ts";
import type { ParsedTpl } from "../src/validate.ts";

function makeTpl(
  overrides: Partial<ParsedTpl["fm"]> & Pick<ParsedTpl["fm"], "id" | "topic">,
): ParsedTpl {
  return {
    file: `${overrides.id}-x.md`,
    body: "",
    fm: {
      title: `title of ${overrides.id}`,
      status: "active",
      date: "2026-10-19",
      applicable_to: ["x"],
      discovered_from: [{ issue: `#${overrides.id.slice(4)}` }],
      scope: { packages: [] },
      ...overrides,
    },
  };
}

const TPL_DIR = "/repo/docs/test-perspectives";
const OPTS = { topics: ["renderer", "app-ui"], tplDir: TPL_DIR, indexPath: `${TPL_DIR}/index.md` };

describe("renderIndex", () => {
  it("groups active TPLs by topic in vocabulary order, then deprecated", () => {
    const out = renderIndex(
      [
        makeTpl({ id: "TPL-30", topic: "app-ui" }),
        makeTpl({ id: "TPL-20", topic: "renderer" }),
        makeTpl({ id: "TPL-10", topic: "renderer", status: "deprecated" }),
      ],
      OPTS,
    );
    const headings = out.split("\n").filter((l) => l.startsWith("## "));
    expect(headings).toEqual(["## renderer", "## app-ui", "## Deprecated"]);
    expect(out).toContain("- [TPL-20](TPL-20-x.md) — title of TPL-20 (#20)");
    expect(out.indexOf("TPL-10")).toBeGreaterThan(out.indexOf("## Deprecated"));
  });

  it("sorts ids numerically within a section", () => {
    const out = renderIndex(
      [
        makeTpl({ id: "TPL-1000", topic: "renderer" }),
        makeTpl({ id: "TPL-999", topic: "renderer" }),
      ],
      OPTS,
    );
    expect(out.indexOf("TPL-999]")).toBeLessThan(out.indexOf("TPL-1000]"));
  });

  it("omits topics with no active TPL and appends unknown topics alphabetically", () => {
    const out = renderIndex(
      [makeTpl({ id: "TPL-2", topic: "zeta" }), makeTpl({ id: "TPL-1", topic: "alpha" })],
      OPTS,
    );
    const headings = out.split("\n").filter((l) => l.startsWith("## "));
    expect(headings).toEqual(["## alpha", "## zeta"]);
  });

  it("collapses whitespace in titles and lists every issue origin", () => {
    const out = renderIndex(
      [
        makeTpl({
          id: "TPL-5",
          topic: "renderer",
          title: "a\n  wrapped   title",
          discovered_from: [{ issue: "#5" }, { root_cause_adr: "ADR-1" }, { issue: "#4" }],
        }),
      ],
      OPTS,
    );
    expect(out).toContain("- [TPL-5](TPL-5-x.md) — a wrapped title (#5, #4)");
  });

  it("links relative to the index file's directory", () => {
    const out = renderIndex([makeTpl({ id: "TPL-1", topic: "renderer" })], {
      ...OPTS,
      indexPath: `${TPL_DIR}/generated/index.md`,
    });
    expect(out).toContain("(../TPL-1-x.md)");
  });

  it("keeps a TPL added to another topic away from this topic's lines", () => {
    // The point of grouping: two branches adding to different topics touch
    // different, non-adjacent lines, so git merges them without a conflict.
    const base = [
      makeTpl({ id: "TPL-1", topic: "renderer" }),
      makeTpl({ id: "TPL-2", topic: "app-ui" }),
    ];
    const lines = (tpls: ParsedTpl[]) => renderIndex(tpls, OPTS).split("\n");
    const a = lines([...base, makeTpl({ id: "TPL-3", topic: "renderer" })]);
    const b = lines([...base, makeTpl({ id: "TPL-4", topic: "app-ui" })]);
    const lineA = a.findIndex((l) => l.includes("TPL-3]"));
    const lineB = b.findIndex((l) => l.includes("TPL-4]"));
    // At least one unchanged line separates the two insertion points.
    expect(Math.abs(lineB - lineA)).toBeGreaterThan(1);
  });
});

describe("regenerate CLI", () => {
  let root: string;
  let out: string;
  let err: string;
  const dir = () => join(root, "docs/test-perspectives");

  const TPL = (id: string, topic: string) =>
    [
      "---",
      `id: ${id}`,
      `title: "perspective ${id}"`,
      "status: active",
      "date: 2026-10-19",
      "applicable_to:",
      '  - "pattern"',
      "discovered_from:",
      `  - issue: "#${id.slice(4)}"`,
      "related_to: []",
      `topic: ${topic}`,
      "scope:",
      "  packages: []",
      "---",
      "",
      `# ${id}`,
      "",
    ].join("\n");

  const writeTpl = (id: string, topic: string) =>
    writeFileSync(join(dir(), `${id}-perspective.md`), TPL(id, topic));
  const writeConfig = (config: object) =>
    writeFileSync(join(root, "tpl.config.json"), JSON.stringify(config));
  const index = () => readFileSync(join(dir(), "index.md"), "utf8");
  const regenerate = (...args: string[]) => regenerateCli(["node", "tpl", ...args]);
  const validate = (...args: string[]) => validateCli(["node", "tpl", ...args]);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tpl-cli-regenerate-"));
    mkdirSync(dir(), { recursive: true });
    // A README with no rows: once indexFile is set, validate must not ask it
    // for one.
    writeFileSync(join(dir(), "README.md"), "# TPL\n\nSee [the index](index.md).\n");
    writeConfig({ idFormat: "issue-number", topics: ["testing"], indexFile: "index.md" });
    writeTpl("TPL-1", "testing");

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

  it("writes the index, and a second run changes nothing", () => {
    expect(regenerate()).toBe(0);
    expect(out).toContain("Wrote docs/test-perspectives/index.md.");
    const first = index();
    expect(first).toContain("## testing");
    expect(first).toContain("- [TPL-1](TPL-1-perspective.md) — perspective TPL-1 (#1)");

    out = "";
    expect(regenerate()).toBe(0);
    expect(out).toContain("is up to date.");
    expect(index()).toBe(first);
  });

  it("--check fails on a missing index without writing it", () => {
    expect(regenerate("--check")).toBe(1);
    expect(err).toContain("index.md is missing; run `tpl regenerate`");
    expect(() => index()).toThrow();
  });

  it("--check fails once a TPL is added, and passes after regenerating", () => {
    expect(regenerate()).toBe(0);
    expect(regenerate("--check")).toBe(0);

    writeTpl("TPL-2", "testing");
    expect(regenerate("--check")).toBe(1);
    expect(err).toContain("index.md is out of date");

    expect(regenerate()).toBe(0);
    expect(regenerate("--check")).toBe(0);
  });

  it("refuses to run without indexFile, so validate and regenerate agree on the file", () => {
    writeConfig({ idFormat: "issue-number", topics: ["testing"] });
    expect(regenerate()).toBe(2);
    expect(err).toContain('no "indexFile" in the config');
  });

  it("validate checks the generated index instead of the README", () => {
    expect(regenerate()).toBe(0);
    expect(validate()).toBe(0);
    expect(out).toContain("Validated 1 TPL(s).");
  });

  it("validate reports a TPL the generated index does not list", () => {
    expect(regenerate()).toBe(0);
    writeTpl("TPL-2", "testing");
    expect(validate()).toBe(1);
    expect(err).toContain("index.md: missing entry for TPL-2; run `tpl regenerate`");
  });

  it("validate reports a configured index that does not exist", () => {
    expect(validate()).toBe(1);
    expect(err).toContain("index.md: index file not found");
  });
});
