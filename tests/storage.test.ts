import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { atomicWriteBatch, atomicWriteFile, withWorkspaceLock } from "../src/storage/index.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("safe filesystem storage", () => {
  it("does not truncate an existing file when the destination is rejected", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "thoth-storage-"));
    roots.push(root);
    const file = path.join(root, "notes.md");
    await writeFile(file, "keep me", "utf8");
    await expect(atomicWriteFile(file, "replacement", { workspaceRoot: root })).resolves.toBeUndefined();
    expect(await readFile(file, "utf8")).toBe("replacement");
    await expect(atomicWriteFile(path.join(root, "token.txt"), "secret", { workspaceRoot: root })).rejects.toThrow(/secret-like/);
    expect(await readFile(file, "utf8")).toBe("replacement");
  });

  it("serializes concurrent mutations and times out a waiter", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "thoth-lock-"));
    roots.push(root);
    await mkdir(root, { recursive: true });
    let active = 0;
    const first = withWorkspaceLock(root, async () => {
      active += 1;
      await new Promise((resolve) => setTimeout(resolve, 60));
      active -= 1;
    });
    await expect(withWorkspaceLock(root, async () => undefined, 5)).rejects.toThrow(/timeout/);
    await first;
    expect(active).toBe(0);
  });

  it("rolls back a batch after an intermediate commit failure and preserves mode", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "thoth-batch-"));
    roots.push(root);
    const first = path.join(root, "first.md");
    const second = path.join(root, "second.md");
    await writeFile(first, "old first", "utf8");
    await writeFile(second, "old second", "utf8");
    await chmod(first, 0o640);
    const originalMode = (await stat(first)).mode & 0o7777;
    await expect(atomicWriteBatch([
      { filePath: first, content: "new first" },
      { filePath: second, content: "new second" },
    ], { workspaceRoot: root, beforeCommit: async (index) => {
      if (index === 1) throw new Error("injected commit failure");
    }})).rejects.toThrow("injected commit failure");
    expect(await readFile(first, "utf8")).toBe("old first");
    expect(await readFile(second, "utf8")).toBe("old second");
    expect((await stat(first)).mode & 0o7777).toBe(originalMode);
  });

  it("writes lock ownership metadata", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "thoth-lock-meta-"));
    roots.push(root);
    await withWorkspaceLock(root, async () => {
      const metadata = JSON.parse(await readFile(path.join(root, ".thoth", ".workspace.lock"), "utf8")) as Record<string, unknown>;
      expect(metadata).toMatchObject({ pid: process.pid, token: expect.any(String), timestamp: expect.any(Number) });
    });
  });
});
