import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findRelated,
  findRelatedByChangedFiles,
  formatRelatedAsMarkdown,
  sourceOfTestFile,
} from "../src/related.ts";
import type { ParsedTpl } from "../src/validate.ts";

function makeTpl(
  overrides: Partial<ParsedTpl["fm"]> & Pick<ParsedTpl["fm"], "id" | "title" | "topic">,
): ParsedTpl {
  return {
    file: `${overrides.id}-x.md`,
    body: "",
    fm: {
      status: "active",
      date: "2026-05-10",
      applicable_to: ["x"],
      discovered_from: [{ issue: "#0" }],
      scope: { packages: ["core"] },
      ...overrides,
    },
  };
}

const FIXTURE: ParsedTpl[] = [
  makeTpl({ id: "TPL-20260510-04", title: "continuous input", topic: "app-ui" }),
  makeTpl({ id: "TPL-20260510-08", title: "derived state", topic: "app-ui" }),
  makeTpl({ id: "TPL-20260510-09", title: "event leak", topic: "app-ui" }),
  makeTpl({
    id: "TPL-20260510-05",
    title: "implicit filter",
    topic: "renderer",
    scope: { packages: ["core", "app"] },
  }),
  makeTpl({
    id: "TPL-20260510-06",
    title: "display mode",
    topic: "renderer",
    scope: { packages: ["core"] },
  }),
  makeTpl({ id: "TPL-20260510-99", title: "old", topic: "renderer", status: "deprecated" }),
];

describe("findRelated", () => {
  it("filters by topic", () => {
    expect(findRelated(FIXTURE, { topic: "app-ui" }).map((m) => m.fm.id)).toEqual([
      "TPL-20260510-04",
      "TPL-20260510-08",
      "TPL-20260510-09",
    ]);
  });

  it("hides deprecated by default", () => {
    expect(findRelated(FIXTURE, { topic: "renderer" }).map((m) => m.fm.id)).toEqual([
      "TPL-20260510-05",
      "TPL-20260510-06",
    ]);
  });

  it("includes deprecated when explicitly requested", () => {
    expect(
      findRelated(FIXTURE, { topic: "renderer", includeStatus: ["active", "deprecated"] }).map(
        (m) => m.fm.id,
      ),
    ).toEqual(["TPL-20260510-05", "TPL-20260510-06", "TPL-20260510-99"]);
  });

  it("filters by package alongside topic (AND)", () => {
    expect(findRelated(FIXTURE, { topic: "renderer", pkg: "app" }).map((m) => m.fm.id)).toEqual([
      "TPL-20260510-05",
    ]);
  });

  it("filters by package alone (no topic)", () => {
    expect(findRelated(FIXTURE, { pkg: "app" }).map((m) => m.fm.id)).toEqual(["TPL-20260510-05"]);
  });

  it("returns empty when nothing matches", () => {
    expect(findRelated(FIXTURE, { topic: "build" })).toEqual([]);
  });
});

describe("formatRelatedAsMarkdown", () => {
  it("produces a markdown bullet list with default repo-root prefix", () => {
    const md = formatRelatedAsMarkdown(findRelated(FIXTURE, { topic: "app-ui" }));
    expect(md.split("\n")).toEqual([
      "- [TPL-20260510-04](docs/test-perspectives/TPL-20260510-04-x.md) — continuous input",
      "- [TPL-20260510-08](docs/test-perspectives/TPL-20260510-08-x.md) — derived state",
      "- [TPL-20260510-09](docs/test-perspectives/TPL-20260510-09-x.md) — event leak",
    ]);
  });

  it("respects a custom path prefix", () => {
    const md = formatRelatedAsMarkdown(findRelated(FIXTURE, { topic: "renderer", pkg: "app" }), {
      pathPrefix: "../test-perspectives/",
    });
    expect(md).toBe(
      "- [TPL-20260510-05](../test-perspectives/TPL-20260510-05-x.md) — implicit filter",
    );
  });

  it("returns empty string when no matches", () => {
    expect(formatRelatedAsMarkdown([])).toBe("");
  });
});

describe("sourceOfTestFile", () => {
  const TS = [".test", ".spec"];

  it("strips the infix before the extension", () => {
    expect(sourceOfTestFile("packages/a/foo.test.ts", TS)).toBe("packages/a/foo.ts");
    expect(sourceOfTestFile("packages/a/Foo.spec.tsx", TS)).toBe("packages/a/Foo.tsx");
    expect(sourceOfTestFile("foo.test.js", TS)).toBe("foo.js");
    expect(sourceOfTestFile("pkg/foo_test.go", ["_test"])).toBe("pkg/foo.go");
  });

  it("returns undefined for a file not named like a test", () => {
    expect(sourceOfTestFile("packages/a/foo.ts", TS)).toBeUndefined();
    expect(sourceOfTestFile("packages/a/latest.ts", TS)).toBeUndefined();
    expect(sourceOfTestFile("packages/a/.test.ts", TS)).toBeUndefined();
    expect(sourceOfTestFile("packages/a/Makefile", TS)).toBeUndefined();
    expect(sourceOfTestFile("packages/a/foo.test.ts", [])).toBeUndefined();
  });
});

describe("findRelatedByChangedFiles", () => {
  let root: string;
  const files = [
    "packages/core/src/shared.ts",
    "packages/core/src/only-a.ts",
    "packages/core/src/parser.ts",
    "packages/core/src/parser.test.ts",
    "packages/core/src/orphan.test.ts",
    ".github/workflows/ci.yml",
    "docs/spec.md",
  ];

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "tpl-related-changed-"));
    for (const f of files) {
      mkdirSync(join(root, f, ".."), { recursive: true });
      writeFileSync(join(root, f), "");
    }
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const tpl = (id: string, body: string, extra: Partial<ParsedTpl["fm"]> = {}): ParsedTpl => ({
    ...makeTpl({ id, title: id, topic: "x", ...extra }),
    body,
  });

  const ids = (
    corpus: ParsedTpl[],
    changed: string[],
    opts: { testFileInfixes?: string[] } = {},
  ): string[] =>
    findRelatedByChangedFiles(corpus, changed, {
      sourcePrefixes: ["packages", ".github"],
      repoRoot: root,
      ...opts,
    }).map((m) => m.tpl.fm.id);

  it("matches a changed file the body names", () => {
    const corpus = [tpl("TPL-1", "- `packages/core/src/only-a.ts`"), tpl("TPL-2", "nothing")];
    expect(ids(corpus, ["packages/core/src/only-a.ts"])).toEqual(["TPL-1"]);
  });

  it("does not key on a directory or a path outside the prefixes", () => {
    const corpus = [
      tpl("TPL-1", "- `packages/core/src/` covers it"),
      tpl("TPL-2", "- `docs/spec.md` covers it"),
    ];
    // `--changed-files` can name a directory; git never lists one.
    expect(ids(corpus, ["packages/core/src", "docs/spec.md"])).toEqual([]);
  });

  it("keeps a missing path as a key, so deleting the file recalls the TPL", () => {
    const corpus = [
      tpl(
        "TPL-1",
        "<!-- absent-path-next-line: deleted in this PR -->\n- `packages/core/src/gone.ts` covered it",
      ),
    ];
    expect(ids(corpus, ["packages/core/src/gone.ts"])).toEqual(["TPL-1"]);
    expect(ids(corpus, ["packages/core/src/shared.ts"])).toEqual([]);
  });

  it("does not key on a path in a fenced block", () => {
    const corpus = [tpl("TPL-1", "```sh\ncat `packages/core/src/only-a.ts`\n```")];
    expect(ids(corpus, ["packages/core/src/only-a.ts"])).toEqual([]);
  });

  it("matches the source of a test file the body names", () => {
    const corpus = [tpl("TPL-1", "- `packages/core/src/parser.test.ts`")];
    expect(ids(corpus, ["packages/core/src/parser.ts"])).toEqual(["TPL-1"]);
    expect(ids(corpus, ["packages/core/src/parser.ts"], { testFileInfixes: [] })).toEqual([]);
  });

  it("maps a test file to its source even when the source is gone", () => {
    const corpus = [tpl("TPL-1", "- `packages/core/src/orphan.test.ts`")];
    // A PR that deletes orphan.ts lists it as changed.
    expect(ids(corpus, ["packages/core/src/orphan.ts"])).toEqual(["TPL-1"]);
    expect(ids(corpus, ["packages/core/src/orphan.tsx"])).toEqual([]);
  });

  it("breaks a tie by id even when float sums differ in the last bit", () => {
    // Ten files each named by ten TPLs sum to 0.9999999999999999, not 1.
    const shared = Array.from({ length: 10 }, (_, i) => `packages/core/src/f${i}.ts`);
    const many = shared.map((f) => `\`${f}\``).join(" ");
    const corpus = [
      tpl("TPL-2", "- `packages/core/src/only-a.ts`"),
      tpl("TPL-1", `- ${many}`),
      ...Array.from({ length: 9 }, (_, i) => tpl(`TPL-${100 + i}`, `- ${many}`)),
    ];
    expect(ids(corpus, ["packages/core/src/only-a.ts", ...shared]).slice(0, 2)).toEqual([
      "TPL-1",
      "TPL-2",
    ]);
  });

  it("matches scope.paths globs and ignores a malformed one", () => {
    const corpus = [
      tpl("TPL-1", "no file named", {
        scope: { packages: [], paths: [".github/workflows/*.yml"] },
      }),
      tpl("TPL-2", "no file named", { scope: { packages: [], paths: [".github/{a,b}.yml"] } }),
    ];
    expect(ids(corpus, [".github/workflows/ci.yml", ".github/a.yml"])).toEqual(["TPL-1"]);
  });

  it("ranks by inverse fan-in, then by numeric id", () => {
    const corpus = [
      // shared.ts is named by three TPLs (1/3 each); only-a.ts by one (1).
      tpl("TPL-1032", "- `packages/core/src/shared.ts`"),
      tpl("TPL-219", "- `packages/core/src/shared.ts`"),
      tpl("TPL-5", "- `packages/core/src/shared.ts` and `packages/core/src/only-a.ts`"),
    ];
    const result = findRelatedByChangedFiles(
      corpus,
      ["packages/core/src/shared.ts", "packages/core/src/only-a.ts"],
      { sourcePrefixes: ["packages"], repoRoot: root },
    );
    expect(result.map((m) => [m.tpl.fm.id, m.weight])).toEqual([
      ["TPL-5", 1 + 1 / 3],
      ["TPL-219", 1 / 3],
      ["TPL-1032", 1 / 3],
    ]);
    expect(result[0].files).toEqual(["packages/core/src/shared.ts", "packages/core/src/only-a.ts"]);
  });

  it("leaves deprecated TPLs out of both the list and the fan-in", () => {
    const corpus = [
      tpl("TPL-1", "- `packages/core/src/shared.ts`"),
      tpl("TPL-2", "- `packages/core/src/shared.ts`", { status: "deprecated" }),
    ];
    const result = findRelatedByChangedFiles(corpus, ["packages/core/src/shared.ts"], {
      sourcePrefixes: ["packages"],
      repoRoot: root,
    });
    expect(result.map((m) => [m.tpl.fm.id, m.weight])).toEqual([["TPL-1", 1]]);
  });

  it("counts a file once per TPL even when two rules match it", () => {
    const corpus = [
      tpl("TPL-1", "- `packages/core/src/parser.ts` and `packages/core/src/parser.test.ts`", {
        scope: { packages: [], paths: ["packages/core/**"] },
      }),
    ];
    const [m] = findRelatedByChangedFiles(corpus, ["packages/core/src/parser.ts"], {
      sourcePrefixes: ["packages"],
      repoRoot: root,
    });
    expect([m.weight, m.files]).toEqual([1, ["packages/core/src/parser.ts"]]);
  });
});

describe("formatRelatedAsMarkdown with matchedFiles", () => {
  it("ends each line with the changed files that matched", () => {
    const tpl = makeTpl({ id: "TPL-1", title: "t", topic: "x" });
    const out = formatRelatedAsMarkdown([tpl], {
      matchedFiles: new Map([["TPL-1", ["packages/a.ts", "packages/b.ts"]]]),
    });
    expect(out).toBe(
      "- [TPL-1](docs/test-perspectives/TPL-1-x.md) — t · via `packages/a.ts`, `packages/b.ts`",
    );
  });
});
