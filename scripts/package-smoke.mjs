import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "thoth-package-smoke-"));
const workspacePath = path.join(tempRoot, "workspace");

try {
  await run("npm", ["run", "build"], repoPath);
  const { stdout } = await run("npm", ["pack", "--json"], repoPath);
  const [{ filename }] = JSON.parse(stdout);
  const tarballPath = path.join(repoPath, filename);

  await writeFile(path.join(tempRoot, "package.json"), "{\"type\":\"module\"}\n", "utf8");
  await run("npm", ["install", tarballPath], tempRoot);
  await mkdir(workspacePath, { recursive: true });
  await writeFile(
    path.join(workspacePath, "thoth.config.json"),
    JSON.stringify({ wikiPath: "../wiki" }),
    "utf8",
  );

  await run("node", [path.join(tempRoot, "node_modules/.bin/thoth"), "--version"], workspacePath);
  await run("node", [path.join(tempRoot, "node_modules/.bin/thoth-mcp"), "--version"], workspacePath);
  await run("node", [path.join(tempRoot, "node_modules/.bin/thoth"), "init"], workspacePath);
  await run("node", [
    path.join(tempRoot, "node_modules/.bin/thoth"),
    "capture",
    "Installed package smoke test note.",
    "--type",
    "note",
    "--title",
    "Package Smoke",
    "--tag",
    "smoke",
  ], workspacePath);
  await run("node", [path.join(tempRoot, "node_modules/.bin/thoth"), "search", "smoke"], workspacePath);
  await run("node", [path.join(tempRoot, "node_modules/.bin/thoth"), "search", "smoke"], tempRoot, {
    THOTH_CONFIG: path.join(workspacePath, "thoth.config.json"),
  });
  await run("node", [path.join(tempRoot, "node_modules/.bin/thoth"), "index", "--human"], workspacePath);
  await run("node", [path.join(tempRoot, "node_modules/.bin/thoth"), "sync-links"], workspacePath);
  await run("node", [path.join(tempRoot, "node_modules/.bin/thoth"), "doctor"], workspacePath);

  await rm(tarballPath, { force: true });
  console.log("Package smoke passed.");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

async function run(command, args, cwd, env = {}) {
  return execFileAsync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    maxBuffer: 1024 * 1024 * 10,
  });
}
