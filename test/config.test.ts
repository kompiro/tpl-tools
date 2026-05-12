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
  it("returns empty topics when no path is given", () => {
    expect(loadReferenceData()).toEqual({ topics: [] });
  });

  it("reads a topics array from a JSON file", () => {
    const path = tmpFile("ref.json", JSON.stringify({ topics: ["a", "b"], other: 1 }));
    expect(loadReferenceData(path)).toEqual({ topics: ["a", "b"] });
  });

  it("treats a missing topics key as empty", () => {
    const path = tmpFile("ref.json", JSON.stringify({ something: "else" }));
    expect(loadReferenceData(path)).toEqual({ topics: [] });
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
