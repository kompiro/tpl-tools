import { describe, expect, it } from "vitest";
import { findRelated, formatRelatedAsMarkdown } from "../src/related.ts";
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
