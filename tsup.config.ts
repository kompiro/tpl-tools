import { copyFileSync } from "node:fs";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
  splitting: false,
  shims: false,
  onSuccess: async () => {
    // Ship the JSON Schema as a file so tpl.config.json can resolve it via $schema.
    copyFileSync("src/config.schema.json", "dist/config.schema.json");
  },
});
