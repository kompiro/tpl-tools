import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ABSENT_PATH_MARKER,
  candidatePath,
  checkSourcePaths,
  sourcePathsInLine,
} from "../src/source-paths.ts";

const PREFIXES = new Set(["packages", "scripts"]);

/**
 * A working tree with one real file and one real directory, so the checks can
 * tell "resolves" from "missing" without depending on this repo's own layout.
 */
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "tpl-source-paths-"));
  mkdirSync(join(root, "packages/core/src/style"), { recursive: true });
  writeFileSync(join(root, "packages/core/src/style/resolver.ts"), "export {};\n");
  mkdirSync(join(root, "packages/core/dist"), { recursive: true });
  writeFileSync(join(root, "packages/core/dist/index.js"), "\n");
  mkdirSync(join(root, "packages-old/core"), { recursive: true });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("candidatePath", () => {
  it("accepts a span that is a path end to end", () => {
    expect(candidatePath("packages/core/src/style/resolver.ts", PREFIXES)).toBe(
      "packages/core/src/style/resolver.ts",
    );
  });

  it("accepts a directory, including a trailing slash", () => {
    // Records legitimately name directories, so the check is existence, not
    // file-ness. 95 such citations exist in karasu's records.
    expect(candidatePath("packages/core/src/style/", PREFIXES)).toBe("packages/core/src/style");
  });

  it.each([
    ["at-*.spec.ts", "a glob"],
    ["<spec path>", "a placeholder"],
    ["cp a b", "a shell line"],
    ["see packages/core/src/x.ts", "prose around the path"],
    ["packages/core/src/x.ts extra", "a trailing word"],
  ])("rejects %s (%s)", (span) => {
    expect(candidatePath(span, PREFIXES)).toBeUndefined();
  });

  it("matches by segment, so a lookalike sibling directory is not the prefix", () => {
    // The whole point of segment comparison: `packages-old` starts with
    // `packages` as a string but is a different top-level directory.
    expect(candidatePath("packages-old/core/src/x.ts", PREFIXES)).toBeUndefined();
  });

  it("rejects a bare prefix, which names the root rather than a subject", () => {
    expect(candidatePath("packages", PREFIXES)).toBeUndefined();
  });

  it("accepts one segment below the prefix", () => {
    expect(candidatePath("packages/app", PREFIXES)).toBe("packages/app");
  });

  it("rejects traversal and backslash separators", () => {
    expect(candidatePath("packages/../etc/passwd", PREFIXES)).toBeUndefined();
    expect(candidatePath("packages/./core/x.ts", PREFIXES)).toBeUndefined();
    expect(candidatePath("packages\\core\\x.ts", PREFIXES)).toBeUndefined();
  });

  it("rejects build output by segment", () => {
    expect(candidatePath("packages/core/dist/index.js", PREFIXES)).toBeUndefined();
    expect(candidatePath("packages/core/node_modules/x/y.js", PREFIXES)).toBeUndefined();
  });

  it("takes the prefixes it is given, not a hard-coded pair", () => {
    expect(candidatePath("lib/x.ts", new Set(["lib"]))).toBe("lib/x.ts");
    expect(candidatePath("packages/core/x.ts", new Set(["lib"]))).toBeUndefined();
  });
});

describe("sourcePathsInLine", () => {
  it("collects every span on the line", () => {
    const line = "See `packages/app/x.ts` and `scripts/gen.ts`, but not packages/bare/prose.ts.";
    expect(sourcePathsInLine(line, PREFIXES)).toEqual(["packages/app/x.ts", "scripts/gen.ts"]);
  });

  it("finds nothing when no prefix matches", () => {
    expect(sourcePathsInLine("`docs/spec/syntax.md`", PREFIXES)).toEqual([]);
  });

  it("reads a multi-backtick span, padding spaces and all", () => {
    // `` … `` is how Markdown writes a span next to backticks. Reading only
    // single backticks left the padding in the candidate, so the path fell out.
    expect(sourcePathsInLine("`` packages/core/src/gone.ts ``", PREFIXES)).toEqual([
      "packages/core/src/gone.ts",
    ]);
  });

  it("closes a span on a run of its own length, so inner backticks are content", () => {
    // One span from the first backtick to the last. Pairing backticks left to
    // right instead would take the middle for a span and name a path the line
    // does not.
    expect(sourcePathsInLine("`a``packages/core/src/gone.ts``b`", PREFIXES)).toEqual([]);
  });
});

describe("checkSourcePaths", () => {
  const check = (md: string) => checkSourcePaths(md, PREFIXES, root);

  it("does nothing without prefixes, so the check stays opt-in", () => {
    expect(checkSourcePaths("`packages/gone/x.ts`", new Set(), root)).toEqual([]);
  });

  it("reports a path that is not in the tree", () => {
    expect(check("- `packages/core/src/gone.ts` covers it\n")).toEqual([
      { kind: "body-source-path-missing", line: 1, path: "packages/core/src/gone.ts" },
    ]);
  });

  it("passes a path that resolves, as a file or as a directory", () => {
    expect(check("`packages/core/src/style/resolver.ts` and `packages/core/src/style/`\n")).toEqual(
      [],
    );
  });

  it("does not read YAML frontmatter", () => {
    // `applicable_to` carries stand-in names that are not meant to resolve.
    const md = [
      "---",
      "applicable_to:",
      '  - "`packages/foo/bar.ts` のような機能"',
      "---",
      "",
    ].join("\n");
    expect(check(md)).toEqual([]);
  });

  it("does not read fenced blocks", () => {
    const md = ["```sh", "cat `packages/core/src/gone.ts`", "```", ""].join("\n");
    expect(check(md)).toEqual([]);
  });

  it("keeps reading after a fence closes", () => {
    const md = ["```sh", "echo hi", "```", "`packages/core/src/gone.ts`"].join("\n");
    expect(check(md)).toEqual([
      { kind: "body-source-path-missing", line: 4, path: "packages/core/src/gone.ts" },
    ]);
  });

  it("closes a fence only on the same character and run length", () => {
    // The inner ``` is content of the ```` block, so the path after it is
    // still fenced; only the ```` line closes.
    const md = ["````md", "```", "`packages/core/src/gone.ts`", "```", "````", ""].join("\n");
    expect(check(md)).toEqual([]);
  });

  it("does not read a fenced block inside a block quote", () => {
    const md = ["> ```sh", "> cat `packages/core/src/gone.ts`", "> ```", ""].join("\n");
    expect(check(md)).toEqual([]);
  });

  it("ends a quoted fence with the quote, so an unclosed one silences nothing", () => {
    // The quote holds no closing fence. Leaving it closes the block anyway, as
    // it does in CommonMark, and the rest of the document is read.
    const md = ["> ```sh", "> echo hi", "", "`packages/core/src/gone.ts`"].join("\n");
    expect(check(md)).toEqual([
      { kind: "body-source-path-missing", line: 4, path: "packages/core/src/gone.ts" },
    ]);
  });

  it("does not open a fence on a paragraph containing a backtick run and a span", () => {
    // ```lang`x is not a fence opener: a backtick fence's info string may not
    // contain a backtick. Opening one would silence the rest of the document.
    // The blank line is load-bearing. Without it the stray backtick pairs with
    // the one before the path, which is what CommonMark does with that
    // paragraph, and the path is then not in a span at all.
    const md = ["```md`x", "", "`packages/core/src/gone.ts`"].join("\n");
    expect(check(md).map((f) => f.kind)).toContain("body-source-path-missing");
  });

  it("reads a code span that wraps onto the next line as one span", () => {
    // The path sits inside the wrapped span, so the record names no path of
    // its own here. Reading each line alone would take the second half for a
    // span and report one.
    const md = ["`` a span that wraps", "`packages/core/src/gone.ts` and ends here ``"];
    expect(check(md.join("\n"))).toEqual([]);
  });

  it("ends a span at the paragraph, so an unclosed run silences nothing", () => {
    const md = ["`` unclosed run", "", "`packages/core/src/gone.ts`"];
    expect(check(md.join("\n"))).toEqual([
      { kind: "body-source-path-missing", line: 3, path: "packages/core/src/gone.ts" },
    ]);
  });

  it("ends a nested quote's fence when the document returns to the outer quote", () => {
    const md = ["> > ```sh", "> > echo hi", "> `packages/core/src/gone.ts`"];
    expect(check(md.join("\n"))).toEqual([
      { kind: "body-source-path-missing", line: 3, path: "packages/core/src/gone.ts" },
    ]);
  });

  it("does not read a fenced block a list item opens on its own line", () => {
    const md = ["- ```sh", "  cat `packages/core/src/gone.ts`", "  ```"];
    expect(check(md.join("\n"))).toEqual([]);
  });

  it("closes a list item's fence at the item's own content column", () => {
    // `10. ` is four wide, so the delimiter that closes this block sits past
    // the three spaces a fence may otherwise carry. Missing it would leave the
    // fence open and silence the rest of the document.
    const md = ["10. ```sh", "    echo hi", "    ```", "`packages/core/src/gone.ts`"];
    expect(check(md.join("\n"))).toEqual([
      { kind: "body-source-path-missing", line: 4, path: "packages/core/src/gone.ts" },
    ]);
  });

  it("does not close a fence on a delimiter one quote deeper", () => {
    // Once the fence's own `>` comes off, the delimiter still carries one, so
    // it is content rather than the close.
    const md = ["> ```sh", "> > ```", "> cat `packages/core/src/gone.ts`", "> ```"];
    expect(check(md.join("\n"))).toEqual([]);
  });

  describe("the absent-path declaration", () => {
    const marker = (reason: string) => `<!-- ${ABSENT_PATH_MARKER}: ${reason} -->`;

    it("suppresses the next line when it gives a reason", () => {
      const md = [marker("retired spec, named as history (#1585)"), "`packages/core/src/gone.ts`"];
      expect(check(md.join("\n"))).toEqual([]);
    });

    it("reaches the next line only, not the line after it", () => {
      const md = [marker("history"), "`packages/core/src/gone.ts`", "`packages/core/src/two.ts`"];
      expect(check(md.join("\n"))).toEqual([
        { kind: "body-source-path-missing", line: 3, path: "packages/core/src/two.ts" },
      ]);
    });

    it("fails when every path on the next line resolves", () => {
      const md = [marker("history"), "`packages/core/src/style/resolver.ts`"];
      expect(check(md.join("\n"))).toEqual([
        { kind: "absent-path-marker-unused", line: 1, path: "" },
      ]);
    });

    it("fails on an empty reason and suppresses nothing", () => {
      const md = [`<!-- ${ABSENT_PATH_MARKER}: -->`, "`packages/core/src/gone.ts`"];
      expect(check(md.join("\n"))).toEqual([
        { kind: "absent-path-marker-empty-reason", line: 1, path: "" },
        { kind: "body-source-path-missing", line: 2, path: "packages/core/src/gone.ts" },
      ]);
    });

    it("fails when it is the last line of the file", () => {
      expect(check(`${marker("history")}\n`)).toEqual([
        { kind: "absent-path-marker-unused", line: 1, path: "" },
      ]);
    });

    it("fails when the next line opens a fence, which it cannot reach into", () => {
      const md = [marker("history"), "```sh", "`packages/core/src/gone.ts`", "```"];
      expect(check(md.join("\n"))).toEqual([
        { kind: "absent-path-marker-unused", line: 1, path: "" },
      ]);
    });

    it("is read through a block quote, which is where the path is read too", () => {
      // The quoted prose below is scanned for paths, so the quoted declaration
      // has to be honoured; otherwise the record has no way to declare it.
      const md = [`> ${marker("history")}`, "> `packages/core/src/gone.ts`"];
      expect(check(md.join("\n"))).toEqual([]);
    });

    it("is spent on a paragraph that only looks like a fence opener", () => {
      // ```md`x is a paragraph, not a fence. The declaration reaches it and
      // finds no absent path there, so it is unused rather than held over for
      // the line below.
      const md = [marker("history"), "```md`x", "", "`packages/core/src/gone.ts`"];
      expect(check(md.join("\n"))).toEqual([
        { kind: "absent-path-marker-unused", line: 1, path: "" },
        { kind: "body-source-path-missing", line: 4, path: "packages/core/src/gone.ts" },
      ]);
    });

    it("does not fire when the syntax is described inside a sentence", () => {
      // A document that teaches the marker writes it in prose. Requiring the
      // marker to be the whole line keeps that from declaring anything.
      const md = `宣言は \`<!-- ${ABSENT_PATH_MARKER}: <reason> -->\` と書く。\n`;
      expect(check(md)).toEqual([]);
    });
  });
});
