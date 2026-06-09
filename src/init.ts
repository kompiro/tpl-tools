import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILENAME } from "./config.ts";
import { INIT_TEMPLATE } from "./init.template.ts";

export interface InitResult {
  written: boolean;
  path: string;
  message: string;
}

export function runInit(cwd: string = process.cwd()): InitResult {
  const target = join(cwd, CONFIG_FILENAME);
  if (existsSync(target)) {
    return {
      written: false,
      path: target,
      message: `${CONFIG_FILENAME} already exists at ${target}; refusing to overwrite.`,
    };
  }
  writeFileSync(target, INIT_TEMPLATE);
  return {
    written: true,
    path: target,
    message: `Generated ${CONFIG_FILENAME} at ${target}. Edit "topics" for your project.`,
  };
}
