import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main as relatedCli } from "../src/cli/related.ts";

const TPL = (id: string, body: string) =>
  [
    "---",
    `id: ${id}`,
    `title: "${id} title"`,
    "status: active",
    "date: 2026-11-03",
    "applicable_to:",
    '  - "pattern"',
    "discovered_from:",
    '  - issue: "#1"',
    "topic: testing",
    "scope:",
    "  packages: []",
    "---",
    "",
    body,
    "",
  ].join("\n");

describe("related CLI", () => {
  let root: string;
  let out: string;
  let err: string;

  const write = (path: string, content = "") => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
      cwd: root,
      stdio: "pipe",
    });
  const run = (args: string[]) => relatedCli(["node", "tpl", ...args]);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tpl-cli-related-"));
    write("packages/core/src/a.ts");
    write("packages/core/src/b.ts");
    write("scripts/gen.ts");
    write("tpl.config.json", JSON.stringify({ sourcePrefixes: ["packages"] }));
    write("docs/test-perspectives/TPL-1-a.md", TPL("TPL-1", "- `packages/core/src/a.ts`"));
    write(
      "docs/test-perspectives/TPL-2-ab.md",
      TPL("TPL-2", "- `packages/core/src/a.ts` and `packages/core/src/b.ts`"),
    );
    write("docs/test-perspectives/TPL-3-gen.md", TPL("TPL-3", "- `scripts/gen.ts`"));

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

  it("lists TPLs naming the changed files, most specific first, with the files matched", () => {
    expect(run(["--changed-files", "packages/core/src/b.ts", "packages/core/src/a.ts"])).toBe(0);
    expect(out.trim().split("\n")).toEqual([
      "- [TPL-2](docs/test-perspectives/TPL-2-ab.md) — TPL-2 title · via `packages/core/src/b.ts`, `packages/core/src/a.ts`",
      "- [TPL-1](docs/test-perspectives/TPL-1-a.md) — TPL-1 title · via `packages/core/src/a.ts`",
    ]);
  });

  it("reads the prefixes from the config, and --source-prefix replaces them", () => {
    expect(run(["--changed-files", "scripts/gen.ts"])).toBe(0);
    expect(out).toBe("");
    expect(err).toContain("No active TPL names a changed file.");

    expect(run(["--changed-files", "scripts/gen.ts", "--source-prefix", "scripts"])).toBe(0);
    expect(out).toContain("[TPL-3]");
  });

  it("refuses to run without any prefix, which would list nothing silently", () => {
    write("tpl.config.json", "{}");
    expect(run(["--changed-files", "packages/core/src/a.ts"])).toBe(2);
    expect(err).toContain('needs "sourcePrefixes"');
  });

  it("cuts the list at --limit and says how many were left out", () => {
    expect(
      run(["--changed-files", "packages/core/src/a.ts", "packages/core/src/b.ts", "--limit", "1"]),
    ).toBe(0);
    expect(out).toContain("[TPL-2]");
    expect(out).not.toContain("[TPL-1]");
    expect(out).toContain("1 more of 2; pass --limit 0 to list all.");
  });

  it("lists everything with --limit 0", () => {
    expect(
      run(["--changed-files", "packages/core/src/a.ts", "packages/core/src/b.ts", "--limit", "0"]),
    ).toBe(0);
    expect(out).toContain("[TPL-1]");
    expect(out).not.toContain("more of");
  });

  it("exits 0 when no file is given", () => {
    expect(run(["--changed-files"])).toBe(0);
    expect(err).toContain("No changed files");
  });

  it("reads the files changed since --base, leaving out what changed on the base", () => {
    git("init", "-q", "-b", "main");
    git("add", ".");
    git("commit", "-q", "-m", "init");
    git("checkout", "-q", "-b", "feature");
    write("packages/core/src/b.ts", "changed on the branch\n");
    git("commit", "-q", "-am", "branch");
    git("checkout", "-q", "main");
    write("packages/core/src/a.ts", "changed on main\n");
    git("commit", "-q", "-am", "main moves on");
    git("checkout", "-q", "feature");

    expect(run(["--base", "main"])).toBe(0);
    expect(out.trim()).toBe(
      "- [TPL-2](docs/test-perspectives/TPL-2-ab.md) — TPL-2 title · via `packages/core/src/b.ts`",
    );
  });

  it("reports a git failure as a usage error", () => {
    git("init", "-q", "-b", "main");
    git("add", ".");
    git("commit", "-q", "-m", "init");
    expect(run(["--base", "no-such-ref"])).toBe(2);
    expect(err).toContain("git diff against no-such-ref failed");
  });

  it.each([
    [["--base", "main", "--changed-files", "x"], "either --changed-files or --base"],
    [["testing", "--base", "main"], "a <topic> cannot be given too"],
    [["--changed-files", "x", "--package", "core"], "--package filters a topic listing"],
    [["testing", "--limit", "3"], "--limit applies to --changed-files and --base"],
    [["--changed-files", "x", "--limit", "ten"], "--limit takes a whole number"],
    [["--changed-files", "x", "--source-prefix", "a/b"], "not a path"],
  ])("rejects %j", (args, message) => {
    expect(run(args)).toBe(2);
    expect(err).toContain(message);
  });

  it("keeps the topic listing as it was", () => {
    expect(run(["testing"])).toBe(0);
    expect(out.trim().split("\n")).toHaveLength(3);
    expect(out).not.toContain("via");
  });
});
