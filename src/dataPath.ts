import { readFileSync } from "node:fs";

/**
 * Reads a JSON file from the package's data/ directory. Resolved from this
 * module's own location, which is one level below the package root both when
 * run from src/ with tsx and when built to dist/.
 */
export function readData(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(`../data/${relative}`, import.meta.url), "utf8"));
}
