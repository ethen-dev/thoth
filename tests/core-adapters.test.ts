import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listThroughCore, lintThroughCore, loadConfig, showThroughCore, writeThroughCore } from "../src/core/index.js";
import { initializeWiki } from "../src/wiki/index.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("Core compatibility adapters", () => {
  it("preserves read payloads while routing through Core", async () => {
    const config = await workspace();
    await mkdir(path.join(config.resolvedWikiPath, "notes"), { recursive: true });
    await writeFile(path.join(config.resolvedWikiPath, "notes", "adapter.md"), "---\nid: note-adapter\ntitle: Adapter\ntype: note\nstatus: active\ntags: []\n---\ncontent\n", "utf8");
    expect(await listThroughCore(config, {})).toEqual(expect.arrayContaining([expect.objectContaining({ id: "note-adapter" })]));
    expect(await showThroughCore(config, "note-adapter", "raw")).toEqual({ raw: expect.stringContaining("content") });
    expect(await lintThroughCore(config)).toMatchObject({ documentsChecked: expect.any(Number), issues: [] });
  });

  it("never writes before confirmation and requires the proposal token", async () => {
    const config = await workspace();
    const request = { intent: "capture" as const, input: { content: "adapter write", title: "Adapter write" } };
    const proposal = await writeThroughCore(config, request);
    expect(proposal).toMatchObject({ ok: true, status: "proposal", error: { code: "confirmation_required" } });
    const tokenOnly = await writeThroughCore(config, request, { confirmationToken: proposal.plan?.confirmationToken });
    expect(tokenOnly).toMatchObject({ ok: true, status: "proposal", error: { code: "confirmation_required" } });
    const executed = await writeThroughCore(config, request, { confirmed: true, confirmationToken: proposal.plan?.confirmationToken });
    expect(executed).toMatchObject({ ok: true, status: "executed" });
  });
});

async function workspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "thoth-adapter-test-"));
  roots.push(root);
  const workspacePath = path.join(root, "workspace");
  await mkdir(workspacePath, { recursive: true });
  await writeFile(path.join(workspacePath, "thoth.config.json"), JSON.stringify({ wikiPath: "wiki" }), "utf8");
  const config = await loadConfig(workspacePath);
  await initializeWiki(config);
  return config;
}
