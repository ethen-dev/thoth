import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { captureWikiDocument, initializeWiki } from "../src/wiki/index.js";
import { loadConfig } from "../src/core/index.js";

const execFile = promisify(execFileCallback);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("CLI relate migration", () => {
  it("proposes first, then executes with the exact token and remains idempotent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "thoth-cli-relate-"));
    roots.push(root);
    const workspace = path.join(root, "workspace");
    await mkdir(workspace, { recursive: true });
    await writeFile(path.join(workspace, "thoth.config.json"), JSON.stringify({ wikiPath: "wiki" }));
    const config = await loadConfig(workspace);
    await initializeWiki(config);
    await captureWikiDocument(config, { content: "source", title: "Source", type: "note" });
    await captureWikiDocument(config, { content: "target", title: "Target", type: "note" });
    const sourcePath = path.join(config.resolvedWikiPath, "notes", "note-source.md");

    const proposal = await runCli(workspace, "relate", "note-source", "note-target", "--relation", "related_to");
    expect(proposal.stdout).toContain("Proposal: confirmation required; no changes were made.");
    expect(await readFile(sourcePath, "utf8")).not.toContain("note-target");
    const token = proposal.stdout.match(/Confirmation token: ([a-f0-9]+)/)?.[1];
    expect(token).toBeTruthy();

    const executed = await runCli(workspace, "relate", "note-source", "note-target", "--relation", "related_to", "--confirmed", "--token", token!);
    expect(executed.stdout).toContain("Status: created");
    const repeated = await runCli(workspace, "relate", "note-source", "note-target", "--relation", "related_to", "--confirmed", "--token", token!);
    expect(repeated.stdout).toContain("Status: exists");
  }, 30_000);
});

async function runCli(cwd: string, ...args: string[]) {
  return execFile(path.join(process.cwd(), "node_modules", ".bin", "tsx"), [path.join(process.cwd(), "src", "cli", "index.ts"), ...args], { cwd });
}
