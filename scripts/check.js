"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const ignored = new Set([".git", "node_modules", "data", "coverage"]);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(fullPath);
  }
}

walk(root);
let failed = 0;

for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed += 1;
    process.stderr.write("\n✗ " + path.relative(root, file) + "\n");
    process.stderr.write(result.stderr || result.stdout || "Syntax check failed.\n");
  }
}

if (failed) {
  process.stderr.write("\nSyntax validation failed for " + failed + " of " + files.length + " JavaScript files.\n");
  process.exitCode = 1;
} else {
  process.stdout.write("Syntax OK: " + files.length + " JavaScript files checked.\n");
}
