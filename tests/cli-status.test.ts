import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("CLI status", () => {
  it("returns exit code 1 and does not write when resources are missing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "thoth-cli-status-"));
    roots.push(root);
    const configPath = path.join(root, "thoth.config.json");
    await writeFile(configPath, JSON.stringify({ wikiPath: "wiki" }), "utf8");

    let failure: { code?: number; stdout?: string } | undefined;
    try {
      await execFileAsync(process.execPath, [
        path.resolve("node_modules/tsx/dist/cli.mjs"),
        path.resolve("src/cli/index.ts"),
        "status",
      ], { cwd: root, env: { ...process.env, THOTH_CONFIG: configPath } });
    } catch (error) {
      failure = error as { code?: number; stdout?: string };
    }

    expect(failure?.code).toBe(1);
    expect(failure?.stdout).toContain("Wiki exists: no");
    await expect(readFile(path.join(root, "wiki", "index.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(root, "wiki", ".thoth", "audit.jsonl"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
