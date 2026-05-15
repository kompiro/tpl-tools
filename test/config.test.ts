import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ReferenceDataInvalidError,
  ReferenceDataMissingError,
  loadReferenceData,
} from "../src/config.ts";

function tmpFile(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "tpl-tools-"));
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
}

describe("loadReferenceData", () => {
  it("returns empty topics and default idFormat when no path is given", () => {
    expect(loadReferenceData()).toEqual({ idFormat: "date-sequence", topics: [] });
  });

  it("reads a topics array from a JSON file", () => {
    const path = tmpFile("ref.json", JSON.stringify({ topics: ["a", "b"], other: 1 }));
    expect(loadReferenceData(path)).toEqual({ idFormat: "date-sequence", topics: ["a", "b"] });
  });

  it("treats a missing topics key as empty", () => {
    const path = tmpFile("ref.json", JSON.stringify({ something: "else" }));
    expect(loadReferenceData(path)).toEqual({ idFormat: "date-sequence", topics: [] });
  });

  it("defaults idFormat to date-sequence when omitted", () => {
    const path = tmpFile("ref.json", JSON.stringify({ topics: ["a"] }));
    expect(loadReferenceData(path).idFormat).toBe("date-sequence");
  });

  it("accepts idFormat: issue-number", () => {
    const path = tmpFile("ref.json", JSON.stringify({ topics: [], idFormat: "issue-number" }));
    expect(loadReferenceData(path).idFormat).toBe("issue-number");
  });

  it("rejects unknown idFormat value", () => {
    const path = tmpFile("ref.json", JSON.stringify({ topics: [], idFormat: "weekly" }));
    expect(() => loadReferenceData(path)).toThrow(/idFormat/);
  });

  it("rejects non-string idFormat value", () => {
    const path = tmpFile("ref.json", JSON.stringify({ topics: [], idFormat: 1 }));
    expect(() => loadReferenceData(path)).toThrow(/idFormat/);
  });

  it("throws when the file does not exist", () => {
    expect(() => loadReferenceData("/no/such/file.json")).toThrow(ReferenceDataMissingError);
  });

  it("throws on invalid JSON", () => {
    const path = tmpFile("ref.json", "{ not json");
    expect(() => loadReferenceData(path)).toThrow(ReferenceDataInvalidError);
  });

  it("throws when topics is not a string array", () => {
    const path = tmpFile("ref.json", JSON.stringify({ topics: [1, 2] }));
    expect(() => loadReferenceData(path)).toThrow(ReferenceDataInvalidError);
  });

  it("throws when the top level is not an object", () => {
    const path = tmpFile("ref.json", JSON.stringify(["a"]));
    expect(() => loadReferenceData(path)).toThrow(ReferenceDataInvalidError);
  });
});
