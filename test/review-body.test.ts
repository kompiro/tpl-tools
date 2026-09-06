import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderReviewBody } from "../src/review-body.ts";

const TPL_DIR = join(resolve(__dirname, "fixtures"), "tpl");
const ISSUE_NUMBER_DIR = join(resolve(__dirname, "fixtures"), "tpl-issue-number");

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

  it("lists issue-number ids, not only date-sequence ones", () => {
    const issueBody = renderReviewBody({
      tplDir: ISSUE_NUMBER_DIR,
      repo: "kompiro/example",
      now: new Date(Date.UTC(2026, 7, 25)),
    });
    expect(issueBody).toContain("## Active TPLs (1)");
    expect(issueBody).toContain(
      "- [ ] [TPL-42](https://github.com/kompiro/example/blob/main/docs/test-perspectives/TPL-42-gamma.md) — gamma perspective _(topic: `testing`)_",
    );
    expect(issueBody).not.toContain("TPL-43");
    expect(issueBody).not.toContain("_No active TPLs");
  });
});
