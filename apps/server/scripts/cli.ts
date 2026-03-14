#!/usr/bin/env node

import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(__dirname, "..");
const repoRoot = resolve(serverDir, "../..");

const command = process.argv[2];

function run(cmd: string, cwd: string) {
  console.log(`[cli] Running: ${cmd}`);
  execSync(cmd, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32" ? "cmd.exe" : undefined,
  });
}

if (command === "build") {
  // Build server with tsdown
  run("tsdown", serverDir);

  // Bundle web client into dist/client if available
  const webDist = resolve(repoRoot, "apps/web/dist");
  const clientTarget = resolve(serverDir, "dist/client");

  if (existsSync(webDist)) {
    if (existsSync(clientTarget)) {
      rmSync(clientTarget, { recursive: true });
    }
    cpSync(webDist, clientTarget, { recursive: true });
    console.log("[cli] Bundled web app into dist/client");
  } else {
    console.warn("[cli] Web dist not found — skipping client bundle.");
  }

  console.log("[cli] Build complete.");
} else {
  console.error(`Unknown command: ${command}`);
  console.error("Usage: node scripts/cli.ts build");
  process.exit(1);
}
