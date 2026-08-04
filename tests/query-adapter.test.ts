import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executePlan, loadConfig, planIntent, queryThroughCore } from "../src/core/index.js";
import { initializeWiki } from "../src/wiki/index.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("Core query compatibility adapter", () => {
  it("matches Core dispatch and preserves filters, summaries, empty results, and limit", async () => {
    const config = await workspace();
    await writeFile(path.join(config.resolvedWikiPath, "notes", "one.md"), "---\nid: note-one\ntitle: One\ntype: note\nstatus: active\ntags: [keep]\n---\nshared query\n", "utf8");
    await writeFile(path.join(config.resolvedWikiPath, "ideas", "two.md"), "---\nid: idea-two\ntitle: Two\ntype: idea\nstatus: draft\ntags: [other]\n---\nshared query\n", "utf8");
    const input = { query: "shared query", status: "active", tag: "keep", limit: 1 };
    const adapterResults = await queryThroughCore(config, input);
    const plan = planIntent(config, { intent: "query", input });
    const core = await executePlan(config, plan);
    expect(adapterResults).toEqual((core.results?.[0] as { results: unknown[] }).results);
    expect(adapterResults).toHaveLength(1);
    expect(adapterResults[0]).not.toHaveProperty("content");
    expect(await queryThroughCore(config, { query: "missing" })).toEqual([]);
    expect(await queryThroughCore(config, { query: "shared query", type: "", status: "", tag: "" })).toHaveLength(2);
  });

  it("uses Core validation for query and limit errors", async () => {
    const config = await workspace();
    await expect(queryThroughCore(config, { query: "" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(queryThroughCore(config, { query: "valid", limit: 21 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(queryThroughCore(config, { query: "x".repeat(501) })).rejects.toMatchObject({ code: "invalid_input" });
  });
});

async function workspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "thoth-query-adapter-"));
  roots.push(root);
  const workspacePath = path.join(root, "workspace");
  await mkdir(workspacePath, { recursive: true });
  await writeFile(path.join(workspacePath, "thoth.config.json"), JSON.stringify({ wikiPath: "wiki" }));
  const config = await loadConfig(workspacePath);
  await initializeWiki(config);
  return config;
}
