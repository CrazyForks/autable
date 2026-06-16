import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const e2eDir = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(e2eDir, "..");
const rootDir = resolve(webDir, "..");
const runtimeDir = join(e2eDir, ".runtime");
const metadataPath = join(runtimeDir, "metadata.yml");
const configPath = join(runtimeDir, "config.yml");

rmSync(runtimeDir, { force: true, recursive: true });
mkdirSync(join(runtimeDir, "data"), { recursive: true });
copyFileSync(join(e2eDir, "fixtures", "metadata.yml"), metadataPath);
writeFileSync(
  configPath,
  [
    "server:",
    '  address: "127.0.0.1:18080"',
    "system_db:",
    `  path: "${join(runtimeDir, "data", "system.sqlite")}"`,
    "history:",
    `  path: "${join(runtimeDir, "data", "leveldb")}"`,
    "repository:",
    `  path: "${join(runtimeDir, "workspace")}"`,
    "oidc:",
    "  providers: []",
    ""
  ].join("\n")
);

const child = spawn(
  "go",
  ["run", "./cmd/codetable", "-config", configPath, "-metadata", metadataPath],
  {
    cwd: rootDir,
    env: { ...process.env, GOTOOLCHAIN: "local" },
    stdio: "inherit"
  }
);

const shutdown = () => {
  child.kill("SIGTERM");
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(0);
  }
  process.exit(code ?? 0);
});
