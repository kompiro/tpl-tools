import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderReviewBody } from "../src/review-body.ts";

const TPL_DIR = join(resolve(__dirname, "fixtures"), "tpl");

describe("renderReviewBody", () => {
  const body = renderReviewBody({
    tplDir: TPL_DIR,
    repo: "kompiro/example",
    now: new Date(Date.UTC(2026, 4, 7)),
  });

  it("includes the ISO week label in the title", () => {
    expect(body).toMatch(/^# TPL deprecation review — 2026-W19\n/);
  });

  it("lists every active fixture TPL with a blob link", () => {
    expect(body).toContain(
      "- [ ] [TPL-20260101-01](https://github.com/kompiro/example/blob/main/docs/test-perspectives/TPL-20260101-01-alpha.md) — alpha perspective _(topic: `testing`)_",
    );
    expect(body).toContain("## Active TPLs (2)");
  });

  it("honours a custom tplDirRelative", () => {
    const custom = renderReviewBody({
      tplDir: TPL_DIR,
      repo: "kompiro/example",
      tplDirRelative: "perspectives",
      now: new Date(Date.UTC(2026, 0, 1)),
    });
    expect(custom).toContain(
      "https://github.com/kompiro/example/blob/main/perspectives/TPL-20260101-01-alpha.md",
    );
    expect(custom).toContain("`perspectives/`");
  });
});
