import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkChecklist,
  checklistRows,
  deriveStatus,
  extractChecklist,
  formatStatus,
  type ChecklistItem,
} from "../src/checklist.ts";

const H = "Checklist";

/** A body whose checklist section holds `items`, between two other sections. */
function body(items: string): string {
  return [
    "# TPL-1: x",
    "",
    "## Perspective",
    "",
    "prose",
    "",
    `## ${H}`,
    "",
    items,
    "",
    "## Known fixes",
    "",
    "- not an item",
  ].join("\n");
}

function only(items: string): ChecklistItem {
  const all = extractChecklist(body(items), H)!.items;
  expect(all).toHaveLength(1);
  return all[0];
}

describe("extractChecklist: the section", () => {
  it("returns undefined when the heading is absent", () => {
    expect(extractChecklist("# T\n\n## Other\n\n- a\n", H)).toBeUndefined();
  });

  it("reads items up to the next heading of any level", () => {
    const md = `## ${H}\n\n- a\n- b\n\n### Out of scope\n\n- c\n`;
    expect(extractChecklist(md, H)!.items.map((i) => i.text)).toEqual(["a", "b"]);
  });

  it("matches the heading at any level and with closing hashes", () => {
    expect(extractChecklist(`### ${H} ###\n\n- a\n`, H)!.items).toHaveLength(1);
  });

  it("does not match a heading-like line inside a fence", () => {
    const md = `\`\`\`md\n## ${H}\n- fake\n\`\`\`\n\n## Other\n`;
    expect(extractChecklist(md, H)).toBeUndefined();
  });

  it("skips frontmatter", () => {
    const md = `---\nid: TPL-1\ntitle: "## ${H}"\n---\n\n## ${H}\n\n- a\n`;
    const list = extractChecklist(md, H)!;
    expect(list.line).toBe(6);
    expect(list.items[0].line).toBe(8);
  });

  it("returns no items for a section without a list", () => {
    expect(extractChecklist(`## ${H}\n\nJust prose.\n`, H)!.items).toEqual([]);
  });
});

describe("extractChecklist: items", () => {
  it("counts task boxes, plain bullets and numbered entries", () => {
    const items = extractChecklist(body("- [ ] a\n- [x] b\n- c\n1. d\n2) e"), H)!.items;
    expect(items.map((i) => [i.n, i.text])).toEqual([
      [1, "a"],
      [2, "b"],
      [3, "c"],
      [4, "d"],
      [5, "e"],
    ]);
  });

  it("joins continuation lines and nested lines into the item", () => {
    const item = only("- [ ] first line\n      second line\n  - nested");
    expect(item.text).toBe("first line second line - nested");
  });

  it("leaves intro and outro prose out of every item", () => {
    const items = extractChecklist(body("When changing X:\n\n- [ ] a\n\nAfterword."), H)!.items;
    expect(items.map((i) => i.text)).toEqual(["a"]);
  });

  it("ends an item at a whole-line HTML comment", () => {
    const items = extractChecklist(body("- [ ] a\n<!-- note -->\n- [ ] b"), H)!.items;
    expect(items.map((i) => i.text)).toEqual(["a", "b"]);
  });

  it("reads a CRLF document the same way", () => {
    const items = extractChecklist(
      body("- [ ] a\n- [ ] b [judgment]").replace(/\n/g, "\r\n"),
      H,
    )!.items;
    expect(items.map((i) => [i.text, i.marker.kind])).toEqual([
      ["a", "none"],
      ["b", "judgment"],
    ]);
  });

  it("does not count a thematic break as an item", () => {
    const items = extractChecklist(body("- [ ] a\n\n* * *\n\n- [ ] b"), H)!.items;
    expect(items.map((i) => i.text)).toEqual(["a", "b"]);
  });

  it("keeps a fence opened on the item's line inside the item", () => {
    const items = extractChecklist(
      body("- ```sh\n  # a comment, not a heading\n  ```\n- [ ] b"),
      H,
    )!.items;
    expect(items.map((i) => i.text)).toEqual(["", "b"]);
  });

  it("continues an item after a fence inside it, so its marker is read", () => {
    const item = only("- [ ] run this\n  ```ts\n  x\n  ```\n  then check [guard: `packages/a.ts`]");
    expect(item.marker).toMatchObject({ kind: "guard" });
    expect(item.text).toBe("run this then check");
  });

  it("keeps a fence opened on a nested item's line inside the item", () => {
    const md = [
      `## ${H}`,
      "",
      "- [ ] run it",
      "  - ```sh",
      "    pnpm test",
      "    ```",
      "- [ ] b [judgment]",
      "",
      "## Notes",
      "",
      "```sh",
      "echo",
      "```",
      "- not an item",
    ].join("\n");
    expect(extractChecklist(md, H)!.items.map((i) => [i.text, i.marker.kind])).toEqual([
      ["run it", "none"],
      ["b", "judgment"],
    ]);
  });

  it("closes an item's fence when the item ends, so a missing closer hides nothing", () => {
    const md = `- \`\`\`sh\n  echo\n\n## ${H}\n\n- a\n`;
    expect(extractChecklist(md, H)!.items.map((i) => i.text)).toEqual(["a"]);
  });

  it("does not join a column-0 line after an item's fence to the item", () => {
    const items = extractChecklist(
      body("- [ ] a\n  ```sh\n  x\n  ```\nOutro prose [judgment]"),
      H,
    )!.items;
    expect(items.map((i) => [i.text, i.marker.kind])).toEqual([["a", "none"]]);
  });

  it("keeps an item open across an indented thematic break", () => {
    expect(only("- [ ] a\n  * * *\n  rest [judgment]").marker).toEqual({ kind: "judgment" });
  });

  it("reads a fence indented four or more past the item's content as code-free text", () => {
    // Indented code in CommonMark, not a fence: it must not swallow what follows.
    const items = extractChecklist(body("- [ ] a\n      ```md\n- [ ] b [judgment]"), H)!.items;
    expect(items.map((i) => i.marker.kind)).toEqual(["none", "judgment"]);
  });

  it("reads a body whose frontmatter was removed without skipping a leading break", () => {
    const md = `---\n\n## ${H}\n\n- a\n`;
    expect(extractChecklist(md, H)).toBeUndefined();
    expect(extractChecklist(md, H, { frontmatter: false })!.items).toHaveLength(1);
  });

  it("keeps an item open across an indented HTML comment, without joining it", () => {
    const item = only(
      "- [ ] the old guard was folded into a\n  <!-- absent-path-next-line: deleted in #1 -->\n  `packages/old.ts` is history [guard: `packages/a.ts`]",
    );
    expect(item.marker).toMatchObject({ kind: "guard", spans: [{ content: "packages/a.ts" }] });
    expect(item.text).toBe("the old guard was folded into a `packages/old.ts` is history");
  });

  it("reads the rest of a line with five or more spaces after the marker as code, not a fence", () => {
    const items = extractChecklist(
      body("-     ```sh\n  [judgment]\n- [ ] two [judgment]"),
      H,
    )!.items;
    expect(items.map((i) => i.marker.kind)).toEqual(["judgment", "judgment"]);
  });

  it("ignores a fence inside the section", () => {
    const items = extractChecklist(body("- [ ] a\n\n```\n- not an item\n```\n\n- [ ] b"), H)!.items;
    expect(items.map((i) => i.text)).toEqual(["a", "b"]);
  });
});

describe("markers", () => {
  it("reads [judgment] at the end", () => {
    const item = only("- [ ] needs a design call [judgment]");
    expect(item.marker).toEqual({ kind: "judgment" });
    expect(item.text).toBe("needs a design call");
  });

  it("reads one guard path", () => {
    expect(only("- [ ] x [guard: `packages/a/b.test.ts`]").marker).toEqual({
      kind: "guard",
      spans: [{ content: "packages/a/b.test.ts", line: 9 }],
    });
  });

  it("reads several guard paths and the line each one is on", () => {
    const m = only("- [ ] x [guard: `packages/a.test.ts`,\n      `scripts/b.ts`]").marker;
    expect(m).toEqual({
      kind: "guard",
      spans: [
        { content: "packages/a.test.ts", line: 9 },
        { content: "scripts/b.ts", line: 10 },
      ],
    });
  });

  it("leaves an unmarked item as none", () => {
    expect(only("- [ ] plain item").marker).toEqual({ kind: "none" });
  });

  // Near misses (TPL-2287): prose that talks about guards or judgment is not a marker.
  it.each([
    ["the words alone", "- [ ] needs judgment, and a guard would help"],
    ["a marker quoted in a code span", "- [ ] write `[judgment]` when no program can decide"],
    ["a guard quoted in a code span", "- [ ] e.g. `[guard: `x`]` names the test"],
    ["a double-backtick span", "- [ ] e.g. `` [guard: `x`] ``"],
    ["another bracketed word", "- [ ] see [guardrails](https://example.com)"],
  ])("reads %s as no marker", (_, item) => {
    expect(only(item).marker).toEqual({ kind: "none" });
  });

  it.each([
    ["punctuation after the marker", "- [ ] x [judgment].", "last text"],
    ["a full-width period after the marker", "- [ ] x [judgment]。", "last text"],
    ["text after a guard", "- [ ] x [guard: `packages/a.ts`] (see #1)", "last text"],
    ["a marker in the middle", "- [ ] x [judgment] and more", "last text"],
    ["a marker glued to the text", "- [ ] x[judgment]", "space"],
    ["the wrong case", "- [ ] x [Judgment]", "expected"],
    ["a space inside the bracket", "- [ ] x [judgment ]", "expected"],
    ["a guard path without a code span", "- [ ] x [guard: packages/a.ts]", "code span"],
    ["an empty guard", "- [ ] x [guard: ]", "code span"],
    ["guard paths without a comma", "- [ ] x [guard: `packages/a.ts` `packages/b.ts`]", "commas"],
    ["an unclosed guard", "- [ ] x [guard: `packages/a.ts`", "commas"],
    ["two markers", "- [ ] x [judgment] [judgment]", "only one marker"],
  ])("reports %s as malformed", (_, item, reason) => {
    const m = only(item).marker;
    expect(m.kind).toBe("malformed");
    expect(m.kind === "malformed" && m.reason).toContain(reason);
  });

  it("reports the line of the offending token", () => {
    const m = only("- [ ] first\n      second [judgment].").marker;
    expect(m).toMatchObject({ kind: "malformed", line: 10 });
  });

  it("keeps the whole text of a malformed item", () => {
    expect(only("- [ ] x [judgment].").text).toBe("x [judgment].");
  });
});

describe("deriveStatus / formatStatus", () => {
  const status = (items: string) => deriveStatus(extractChecklist(body(items), H)!.items);
  const G = "[guard: `packages/a.ts`]";

  it("is guarded when every checkable item has a guard", () => {
    const c = status(`- a ${G}\n- b [judgment]`);
    expect(c).toEqual({ guarded: 1, unguarded: 0, judgment: 1, status: "guarded" });
    expect(formatStatus(c)).toBe("guarded 1/1, judgment 1");
  });

  it("is partial when some checkable items have a guard", () => {
    expect(formatStatus(status(`- a ${G}\n- b`))).toBe("partial 1/2");
  });

  it("is unguarded when no item has a guard", () => {
    expect(formatStatus(status("- a\n- b [judgment]"))).toBe("unguarded 0/1, judgment 1");
  });

  it("is judgment when every item is judgment, not vacuously guarded", () => {
    expect(formatStatus(status("- a [judgment]\n- b [judgment]"))).toBe("judgment 2");
  });

  it("counts a malformed marker as unguarded", () => {
    expect(status(`- a ${G}\n- b [judgment].`).status).toBe("partial");
  });

  it("has no status without items", () => {
    expect(formatStatus(deriveStatus([]))).toBe("no checklist items");
  });
});

describe("checkChecklist", () => {
  let root: string;
  const prefixes = new Set(["packages", "scripts"]);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tpl-checklist-"));
    mkdirSync(join(root, "packages/core/src"), { recursive: true });
    writeFileSync(join(root, "packages/core/src/a.test.ts"), "");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const check = (items: string) => checkChecklist(body(items), H, prefixes, root);

  it("reports a missing section", () => {
    expect(checkChecklist("# T\n", H, prefixes, root)).toEqual([
      { kind: "checklist-missing", heading: H },
    ]);
  });

  it("reports a section without items", () => {
    expect(checkChecklist(`## ${H}\n\nprose\n`, H, prefixes, root)).toEqual([
      { kind: "checklist-empty", line: 1, heading: H },
    ]);
  });

  it("passes markers that are well formed and resolve to files", () => {
    expect(check("- a [guard: `packages/core/src/a.test.ts`]\n- b [judgment]\n- c")).toEqual([]);
  });

  it("reports a malformed marker", () => {
    expect(check("- a [judgment].")).toEqual([
      { kind: "checklist-marker-malformed", line: 9, reason: expect.stringContaining("last text") },
    ]);
  });

  it.each([
    ["a line number", "packages/core/src/a.test.ts:12"],
    ["a glob", "packages/core/src/*.test.ts"],
    ["a directory written with a slash", "packages/core/src/"],
    ["a path outside every prefix", "lib/a.test.ts"],
    ["a bare file name", "a.test.ts"],
    ["generated output", "packages/core/dist/a.js"],
  ])("reports a guard span with %s as unchecked", (_, span) => {
    expect(check(`- a [guard: \`${span}\`]`)).toEqual([
      { kind: "checklist-guard-path-unchecked", line: 9, span },
    ]);
  });

  it("reports a guard that names a directory", () => {
    expect(check("- a [guard: `packages/core/src`]")).toEqual([
      { kind: "checklist-guard-not-file", line: 9, path: "packages/core/src" },
    ]);
  });

  it("reports a guard file that does not exist", () => {
    expect(check("- a [guard: `packages/core/src/gone.test.ts`]")).toEqual([
      { kind: "checklist-guard-missing", line: 9, path: "packages/core/src/gone.test.ts" },
    ]);
  });

  it("reports a guard declared absent on a continuation line", () => {
    const md = `## ${H}\n\n- [ ] check new sites\n  <!-- absent-path-next-line: deleted -->\n  [guard: \`packages/core/src/gone.test.ts\`]\n`;
    expect(checkChecklist(md, H, prefixes, root)).toEqual([
      {
        kind: "checklist-guard-declared-absent",
        line: 5,
        path: "packages/core/src/gone.test.ts",
      },
    ]);
  });

  it("reads a CRLF document the same way", () => {
    const md = body("- a [guard: `packages/core/src/gone.test.ts`]\n- b").replace(/\n/g, "\r\n");
    expect(checkChecklist(md, H, prefixes, root)).toEqual([
      { kind: "checklist-guard-missing", line: 9, path: "packages/core/src/gone.test.ts" },
    ]);
  });

  it("reports a guard declared absent", () => {
    const md = `## ${H}\n\n<!-- absent-path-next-line: removed -->\n- a [guard: \`packages/core/src/gone.test.ts\`]\n`;
    expect(checkChecklist(md, H, prefixes, root)).toEqual([
      {
        kind: "checklist-guard-declared-absent",
        line: 4,
        path: "packages/core/src/gone.test.ts",
      },
    ]);
  });
});

describe("checklistRows", () => {
  it("lists each item with its marker, guards and text", () => {
    const tpl = {
      file: "TPL-1-x.md",
      fm: { id: "TPL-1", topic: "testing" },
      body: body(
        "- a [guard: `packages/a.ts`, `scripts/b.ts`]\n- b [judgment]\n- c\n- d [judgment].",
      ),
    };
    expect(checklistRows([tpl], H).map((r) => [r.n, r.marker, r.guards, r.text])).toEqual([
      [1, "guard", ["packages/a.ts", "scripts/b.ts"], "a"],
      [2, "judgment", [], "b"],
      [3, "unguarded", [], "c"],
      [4, "malformed", [], "d [judgment]."],
    ]);
  });
});
