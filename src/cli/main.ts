#!/usr/bin/env node
import { createScanner } from "../scan/scanner.js";
import { run } from "./run.js";

/** `eaa-cite <command>`. See run.ts for the commands and exit codes. */
process.exitCode = await run(process.argv.slice(2), {
  out: (text) => process.stdout.write(text + "\n"),
  err: (text) => process.stderr.write(text + "\n"),
  createScanner,
});
