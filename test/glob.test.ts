import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { globBase, globMatchesAFile, globSyntaxError, matchesGlob } from "../src/glob.ts";

describe("globSyntaxError", () => {
  it.each([
    "packages/core/src/a.ts",
    "packages/*/src/*.ts",
    "packages/**",
    "**/*.yml",
    ".github/workflows/e2e?.yml",
    "packages/**/test/**/*.spec.ts",
  ])("accepts %s", (glob) => {
    expect(globSyntaxError(glob)).toBeUndefined();
  });

  it.each([
    ["", "is empty"],
    ["packages\\core", '"\\"'],
    ["/packages/a.ts", "leading or trailing"],
    ["packages/", "leading or trailing"],
    ["packages//a.ts", "empty segment"],
    ["packages/../a.ts", '"." or ".."'],
    ["./packages/a.ts", '"." or ".."'],
    ["packages/{a,b}.ts", "other than"],
    ["packages/[ab].ts", "other than"],
    ["!packages/a.ts", "other than"],
    ["packages/a**.ts", "whole path segment"],
    ["packages/*/dist/*.js", 'goes through "dist"'],
    ["node_modules/**", 'goes through "node_modules"'],
    [".git/config", 'goes through ".git"'],
  ])("rejects %s", (glob, reason) => {
    expect(globSyntaxError(glob)).toContain(reason);
  });
});

describe("matchesGlob", () => {
  it("keeps * and ? inside one segment", () => {
    expect(matchesGlob("packages/core/a.ts", "packages/*/a.ts")).toBe(true);
    expect(matchesGlob("packages/core/x/a.ts", "packages/*/a.ts")).toBe(false);
    expect(matchesGlob("e2e1.yml", "e2e?.yml")).toBe(true);
    expect(matchesGlob("e2e/.yml", "e2e?.yml")).toBe(false);
  });

  it("lets a ** segment span zero or more segments", () => {
    expect(matchesGlob("packages/a.ts", "packages/**/a.ts")).toBe(true);
    expect(matchesGlob("packages/x/y/a.ts", "packages/**/a.ts")).toBe(true);
    expect(matchesGlob("a.yml", "**/*.yml")).toBe(true);
    expect(matchesGlob(".github/workflows/ci.yml", "**/*.yml")).toBe(true);
  });

  it("requires at least one segment under a trailing **", () => {
    expect(matchesGlob("packages/core/a.ts", "packages/**")).toBe(true);
    expect(matchesGlob("packages", "packages/**")).toBe(false);
  });

  it("reads regex characters literally", () => {
    expect(matchesGlob("a+b.ts", "a+b.ts")).toBe(true);
    expect(matchesGlob("aab.ts", "a+b.ts")).toBe(false);
    expect(matchesGlob("aXts", "a.ts")).toBe(false);
  });

  it("matches the whole path, never a prefix or suffix of it", () => {
    expect(matchesGlob("packages/core/a.ts.bak", "packages/core/*.ts")).toBe(false);
    expect(matchesGlob("old/packages/core/a.ts", "packages/core/*.ts")).toBe(false);
  });
});

describe("globBase", () => {
  it("takes the leading segments without a wildcard, never the last one", () => {
    expect(globBase("packages/core/**/*.ts")).toBe("packages/core");
    expect(globBase("packages/*/src/a.ts")).toBe("packages");
    expect(globBase("packages/core/a.ts")).toBe("packages/core");
    expect(globBase("**/*.yml")).toBe("");
    expect(globBase("a.ts")).toBe("");
  });
});

describe("globMatchesAFile", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "tpl-glob-"));
    mkdirSync(join(root, "packages/core/src"), { recursive: true });
    writeFileSync(join(root, "packages/core/src/a.ts"), "");
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    writeFileSync(join(root, ".github/workflows/ci.yml"), "");
    mkdirSync(join(root, "node_modules/x"), { recursive: true });
    writeFileSync(join(root, "node_modules/x/only.js"), "");
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, ".git/only.cfg"), "");
    symlinkSync(join(root, "packages"), join(root, "packages/core/loop"));
    symlinkSync(join(root, "packages/core/src/a.ts"), join(root, "packages/core/linked.ts"));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("finds a file the glob names, dot directories included", () => {
    expect(globMatchesAFile("packages/**/*.ts", root)).toBe(true);
    expect(globMatchesAFile(".github/workflows/*.yml", root)).toBe(true);
    expect(globMatchesAFile("**/ci.yml", root)).toBe(true);
  });

  it("reports a glob that matches nothing, including one under a missing directory", () => {
    expect(globMatchesAFile("packages/**/*.tsx", root)).toBe(false);
    expect(globMatchesAFile("scripts/*.ts", root)).toBe(false);
  });

  it("counts a symlink to a file as a file", () => {
    expect(globMatchesAFile("packages/core/linked.ts", root)).toBe(true);
  });

  it("does not count a directory as a match", () => {
    expect(globMatchesAFile("packages/*", root)).toBe(false);
  });

  it("skips .git and build output, and does not follow symlinks", () => {
    expect(globMatchesAFile("**/only.js", root)).toBe(false);
    expect(globMatchesAFile("**/only.cfg", root)).toBe(false);
    // The walk stops at the symlinked directory rather than entering it.
    expect(globMatchesAFile("packages/**/loop/**", root)).toBe(false);
  });

  it("walks a base once per cache", () => {
    const cache = new Map<string, readonly string[]>();
    globMatchesAFile("packages/core/**/*.ts", root, cache);
    globMatchesAFile("packages/core/src/*.ts", root, cache);
    expect([...cache.keys()]).toEqual(["packages/core", "packages/core/src"]);
  });
});
