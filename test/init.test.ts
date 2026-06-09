import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG_FILENAME, loadReferenceData } from "../src/config.ts";
import { runInit } from "../src/init.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tpl-init-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("runInit", () => {
  it("writes tpl.config.json from the bundled template", () => {
    const result = runInit(tmp);
    expect(result.written).toBe(true);
    expect(existsSync(join(tmp, CONFIG_FILENAME))).toBe(true);
    expect(result.message).toContain("Generated");
  });

  it("refuses to overwrite an existing file", () => {
    writeFileSync(join(tmp, CONFIG_FILENAME), "existing");
    const result = runInit(tmp);
    expect(result.written).toBe(false);
    expect(result.message).toContain("already exists");
    expect(readFileSync(join(tmp, CONFIG_FILENAME), "utf8")).toBe("existing");
  });

  it("generated config passes loadReferenceData roundtrip", () => {
    runInit(tmp);
    const ref = loadReferenceData(join(tmp, CONFIG_FILENAME));
    expect(ref.topics.length).toBeGreaterThan(0);
    expect(ref.idFormat).toBe("date-sequence");
  });
});
