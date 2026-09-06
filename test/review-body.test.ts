import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main as reviewBodyCli } from "../src/cli/review-body.ts";
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

  it("uses an explicit period label instead of the ISO week", () => {
    const monthly = renderReviewBody({
      tplDir: TPL_DIR,
      repo: "kompiro/example",
      periodLabel: "2026-08",
      // `now` would yield 2026-W19; the explicit label must win so the body
      // agrees with the Issue title the caller writes.
      now: new Date(Date.UTC(2026, 4, 7)),
    });
    expect(monthly).toMatch(/^# TPL deprecation review — 2026-08\n/);
    expect(monthly).not.toContain("2026-W19");
  });
});

describe("review-body CLI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function run(args: string[]): { code: number; out: string; err: string } {
    let out = "";
    let err = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      err += String(chunk);
      return true;
    });
    const code = reviewBodyCli(["node", "tpl", ...args]);
    return { code, out, err };
  }

  const BASE = ["--tpl-dir", TPL_DIR, "--repo", "kompiro/example"];

  it("passes --period-label through to the heading", () => {
    const { code, out } = run([...BASE, "--period-label", "2026-08"]);
    expect(code).toBe(0);
    expect(out).toMatch(/^# TPL deprecation review — 2026-08\n/);
  });

  it("falls back to the ISO week when no label is given", () => {
    const { code, out } = run(BASE);
    expect(code).toBe(0);
    expect(out).toMatch(/^# TPL deprecation review — \d{4}-W\d{2}\n/);
  });

  it("rejects a blank --period-label instead of emitting a bare dash", () => {
    const { code, out, err } = run([...BASE, "--period-label", "   "]);
    expect(code).toBe(2);
    expect(out).toBe("");
    expect(err).toContain("--period-label requires a non-empty label");
  });
});
