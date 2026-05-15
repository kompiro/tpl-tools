import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadReferenceData } from "../src/config.ts";
import {
  type Finding,
  type ParsedTpl,
  formatFinding,
  parseFrontmatter,
  validateAll,
  validateFile,
  validateReadmeIndex,
  validateRelatedTo,
} from "../src/validate.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURE_DIR = resolve(__dirname, "fixtures");
const TPL_DIR = join(FIXTURE_DIR, "tpl");
const README_PATH = join(TPL_DIR, "README.md");
const VALID_TOPICS = loadReferenceData(join(FIXTURE_DIR, "reference-data.json")).topics;

function findingKinds(findings: readonly Finding[]): string[] {
  return findings.map((f) => f.kind);
}

function makeFm(overrides: Record<string, unknown> = {}): string {
  const base: Record<string, unknown> = {
    id: "TPL-20260510-99",
    title: "test entry",
    status: "active",
    date: "2026-05-10",
    applicable_to: ["pattern"],
    discovered_from: [{ issue: "#0" }],
    topic: "testing",
    scope: { packages: ["core"] },
    ...overrides,
  };
  const lines: string[] = ["---"];
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${k}: []`);
        continue;
      }
      lines.push(`${k}:`);
      for (const item of v) {
        if (typeof item === "object" && item !== null) {
          const entries = Object.entries(item);
          if (entries.length === 1) {
            lines.push(`  - ${entries[0][0]}: ${JSON.stringify(entries[0][1])}`);
          } else {
            lines.push("  -");
            for (const [ek, ev] of entries) lines.push(`    ${ek}: ${JSON.stringify(ev)}`);
          }
        } else {
          lines.push(`  - ${JSON.stringify(item)}`);
        }
      }
    } else if (typeof v === "object" && v !== null) {
      lines.push(`${k}:`);
      for (const [sk, sv] of Object.entries(v)) {
        if (Array.isArray(sv)) {
          lines.push(`  ${sk}:`);
          for (const item of sv) lines.push(`    - ${JSON.stringify(item)}`);
        } else {
          lines.push(`  ${sk}: ${JSON.stringify(sv)}`);
        }
      }
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  lines.push("---", "", "# Body", "", "placeholder body");
  return lines.join("\n");
}

const CTX = { validTopics: VALID_TOPICS, validPackages: ["core", "app"] as const };

// ---------------------------------------------------------------------------
// Regression fence: bundled fixtures must pass cleanly
// ---------------------------------------------------------------------------

describe("regression fence — fixture TPL corpus", () => {
  it("validates the fixture TPLs without findings", () => {
    const result = validateAll({
      tplDir: TPL_DIR,
      validTopics: VALID_TOPICS,
      validPackages: null,
      readmePath: README_PATH,
    });
    if (result.findings.length > 0) {
      throw new Error(
        `Unexpected findings:\n${result.findings.map((f) => `  - ${formatFinding(f)}`).join("\n")}`,
      );
    }
    expect(result.findings).toEqual([]);
    expect(result.parsed.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Per-finding-kind coverage
// ---------------------------------------------------------------------------

describe("per-Finding-kind coverage", () => {
  it("yaml-parse-error", () => {
    const broken = '---\nid: "unterminated\ntitle: x\n---\nbody\n';
    const { findings } = validateFile("TPL-20260510-99-x.md", broken, CTX);
    expect(findingKinds(findings)).toContain("yaml-parse-error");
  });

  it("missing-frontmatter", () => {
    const { findings } = validateFile("TPL-20260510-99-x.md", "no frontmatter here\n", CTX);
    expect(findingKinds(findings)).toContain("missing-frontmatter");
  });

  it("filename-id-mismatch", () => {
    const { findings } = validateFile(
      "TPL-20260510-99-x.md",
      makeFm({ id: "TPL-20260510-77" }),
      CTX,
    );
    expect(findingKinds(findings)).toContain("filename-id-mismatch");
  });

  it("id-format-invalid", () => {
    const { findings } = validateFile("TPL-20260510-99-x.md", makeFm({ id: "BAD-ID" }), CTX);
    expect(findingKinds(findings)).toContain("id-format-invalid");
  });

  it("missing-required-field — title", () => {
    const { findings } = validateFile("TPL-20260510-99-x.md", makeFm({ title: undefined }), CTX);
    expect(
      findings.some(
        (f) => f.kind === "missing-required-field" && (f as { field: string }).field === "title",
      ),
    ).toBe(true);
  });

  it("status-invalid", () => {
    const { findings } = validateFile("TPL-20260510-99-x.md", makeFm({ status: "wip" }), CTX);
    expect(findingKinds(findings)).toContain("status-invalid");
  });

  it("topic-invalid", () => {
    const { findings } = validateFile(
      "TPL-20260510-99-x.md",
      makeFm({ topic: "not-a-real-topic" }),
      CTX,
    );
    expect(findingKinds(findings)).toContain("topic-invalid");
  });

  it("topic check is skipped when validTopics is empty", () => {
    const { findings } = validateFile("TPL-20260510-99-x.md", makeFm({ topic: "anything" }), {
      validTopics: [],
      validPackages: null,
    });
    expect(findingKinds(findings)).not.toContain("topic-invalid");
  });

  it("applicable-to-empty", () => {
    const { findings } = validateFile("TPL-20260510-99-x.md", makeFm({ applicable_to: [] }), CTX);
    expect(findingKinds(findings)).toContain("applicable-to-empty");
  });

  it("discovered-from-empty", () => {
    const { findings } = validateFile("TPL-20260510-99-x.md", makeFm({ discovered_from: [] }), CTX);
    expect(findingKinds(findings)).toContain("discovered-from-empty");
  });

  it("discovered-from-unknown-key", () => {
    const { findings } = validateFile(
      "TPL-20260510-99-x.md",
      makeFm({ discovered_from: [{ unknown_key: "x" }] }),
      CTX,
    );
    expect(findingKinds(findings)).toContain("discovered-from-unknown-key");
  });

  it("scope-package-missing", () => {
    const { findings } = validateFile(
      "TPL-20260510-99-x.md",
      makeFm({ scope: { packages: ["nonexistent-pkg"] } }),
      CTX,
    );
    expect(findingKinds(findings)).toContain("scope-package-missing");
  });

  it("scope.packages check is skipped when validPackages is null", () => {
    const { findings } = validateFile(
      "TPL-20260510-99-x.md",
      makeFm({ scope: { packages: ["whatever"] } }),
      { validTopics: VALID_TOPICS, validPackages: null },
    );
    expect(findingKinds(findings)).not.toContain("scope-package-missing");
  });

  it("deprecated-no-rationale", () => {
    const fm = makeFm({ status: "deprecated" }).replace(/placeholder body/g, "no rationale here");
    const { findings } = validateFile("TPL-20260510-99-x.md", fm, CTX);
    expect(findingKinds(findings)).toContain("deprecated-no-rationale");
  });

  it("deprecated WITH rationale passes", () => {
    const fm = makeFm({ status: "deprecated" }).replace(
      /placeholder body/g,
      "This perspective is **deprecated** because the underlying assumption changed.",
    );
    const { findings } = validateFile("TPL-20260510-99-x.md", fm, CTX);
    expect(findingKinds(findings)).not.toContain("deprecated-no-rationale");
  });
});

// ---------------------------------------------------------------------------
// Cross-file: related_to dangling
// ---------------------------------------------------------------------------

function tpl(fm: Partial<ParsedTpl["fm"]> & Pick<ParsedTpl["fm"], "id">): ParsedTpl {
  return {
    file: `${fm.id}-x.md`,
    body: "",
    fm: {
      title: "x",
      status: "active",
      date: "2026-05-10",
      applicable_to: ["a"],
      discovered_from: [{ issue: "#1" }],
      topic: "testing",
      scope: { packages: ["core"] },
      ...fm,
    },
  };
}

describe("related_to dangling check", () => {
  it("flags refs to non-existent IDs", () => {
    const findings = validateRelatedTo([
      tpl({ id: "TPL-20260510-01", related_to: ["TPL-20260510-99"] }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("related-to-dangling");
  });

  it("passes when refs resolve", () => {
    const findings = validateRelatedTo([
      tpl({ id: "TPL-20260510-01", related_to: ["TPL-20260510-02"] }),
      tpl({ id: "TPL-20260510-02" }),
    ]);
    expect(findings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// README index check
// ---------------------------------------------------------------------------

describe("README index check", () => {
  it("flags missing rows", () => {
    const { findings } = validateReadmeIndex(
      "no index here",
      [tpl({ id: "TPL-20260510-01" })],
      "/dev/null",
    );
    expect(findings.some((f) => f.kind === "readme-missing-row")).toBe(true);
  });

  it("ignores TPL-link markdown inside fenced code blocks", () => {
    const readme = [
      "# normal section",
      "[TPL-20260101-01](TPL-20260101-01-alpha.md)",
      "",
      "```",
      "$ tpl related app-ui",
      "- [TPL-99999999-99](TPL-99999999-99-fake.md) — example output",
      "```",
    ].join("\n");
    const { rowIds } = validateReadmeIndex(readme, [], TPL_DIR);
    expect([...rowIds]).toEqual(["TPL-20260101-01"]);
  });

  it("flags rows that point to missing files", () => {
    const { findings } = validateReadmeIndex(
      "[TPL-20260510-99](TPL-20260510-99-missing.md)",
      [],
      TPL_DIR,
    );
    expect(findings.some((f) => f.kind === "readme-row-points-to-missing-file")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// idFormat: issue-number coverage
// ---------------------------------------------------------------------------

describe("validate with idFormat: issue-number", () => {
  const ISSUE_CTX = {
    validTopics: VALID_TOPICS,
    validPackages: null,
    idFormat: "issue-number" as const,
  };

  it("accepts issue-number id and matching filename", () => {
    const { findings, parsed } = validateFile(
      "TPL-30-x.md",
      makeFm({ id: "TPL-30", scope: { packages: [] } }),
      ISSUE_CTX,
    );
    expect(findings).toEqual([]);
    expect(parsed?.fm.id).toBe("TPL-30");
  });

  it("flags filename / id mismatch under issue-number", () => {
    const { findings } = validateFile(
      "TPL-30-x.md",
      makeFm({ id: "TPL-31", scope: { packages: [] } }),
      ISSUE_CTX,
    );
    expect(
      findings.some(
        (f) =>
          f.kind === "filename-id-mismatch" &&
          (f as { idInFm: string; idInFile: string }).idInFm === "TPL-31" &&
          (f as { idInFm: string; idInFile: string }).idInFile === "TPL-30",
      ),
    ).toBe(true);
  });

  it("flags date-sequence id under issue-number format", () => {
    const { findings } = validateFile(
      "TPL-30-x.md",
      makeFm({ id: "TPL-20260510-01", scope: { packages: [] } }),
      ISSUE_CTX,
    );
    expect(
      findings.some(
        (f) =>
          f.kind === "id-format-invalid" && (f as { expected: string }).expected === "issue-number",
      ),
    ).toBe(true);
  });

  it("matches issue-number README links via validateReadmeIndex", () => {
    const tpl: ParsedTpl = {
      file: "TPL-30-x.md",
      fm: {
        id: "TPL-30",
        title: "x",
        status: "active",
        date: "2026-05-15",
        applicable_to: ["p"],
        discovered_from: [{ issue: "#30" }],
        topic: "testing",
        scope: { packages: [] },
      },
      body: "",
    };
    const { rowIds, findings } = validateReadmeIndex(
      "| ID | title |\n|---|---|\n| [TPL-30](TPL-30-x.md) | x |\n",
      [tpl],
      TPL_DIR,
      "issue-number",
    );
    expect(rowIds.has("TPL-30")).toBe(true);
    expect(findings.every((f) => f.kind !== "readme-missing-row")).toBe(true);
  });

  it("does not greedy-match TPL-3 inside TPL-30 in README links", () => {
    const tpl3: ParsedTpl = {
      file: "TPL-3-x.md",
      fm: {
        id: "TPL-3",
        title: "x",
        status: "active",
        date: "2026-05-15",
        applicable_to: ["p"],
        discovered_from: [{ issue: "#3" }],
        topic: "testing",
        scope: { packages: [] },
      },
      body: "",
    };
    const { rowIds } = validateReadmeIndex(
      // Only TPL-30 is linked. If the regex weren't bounded by the bracket
      // we might pick up a phantom TPL-3 too.
      "| ID |\n|---|\n| [TPL-30](TPL-30-x.md) |\n",
      [tpl3],
      TPL_DIR,
      "issue-number",
    );
    expect(rowIds.has("TPL-30")).toBe(true);
    expect(rowIds.has("TPL-3")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("returns null fm when no frontmatter delimiters", () => {
    const r = parseFrontmatter("just body");
    expect(r.fm).toBeNull();
    expect(r.body).toBe("just body");
    expect(r.error).toBeNull();
  });

  it("parses a simple frontmatter block", () => {
    const r = parseFrontmatter("---\nid: TPL-20260510-01\n---\nbody\n");
    expect((r.fm as { id?: string }).id).toBe("TPL-20260510-01");
    expect(r.body).toBe("body\n");
    expect(r.error).toBeNull();
  });
});
