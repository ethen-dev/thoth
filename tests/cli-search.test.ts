import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatCliSearch, runCliSearch } from "../src/cli/search.js";
import { loadConfig } from "../src/core/index.js";
import { initializeWiki } from "../src/wiki/index.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("CLI search Core adapter", () => {
  it("keeps textual summaries, filters, limits, empty output, and error codes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "thoth-cli-search-"));
    roots.push(root);
    const workspace = path.join(root, "workspace");
    await mkdir(workspace, { recursive: true });
    await writeFile(path.join(workspace, "thoth.config.json"), JSON.stringify({ wikiPath: "wiki" }));
    const config = await loadConfig(workspace);
    await initializeWiki(config);
    await writeFile(path.join(config.resolvedWikiPath, "notes", "match.md"), "---\nid: note-match\ntitle: Match\ntype: note\nstatus: active\ntags: [keep]\n---\nneedle\n", "utf8");
    await writeFile(path.join(config.resolvedWikiPath, "notes", "other.md"), "---\nid: note-other\ntitle: Other\ntype: note\nstatus: draft\ntags: [other]\n---\nneedle\n", "utf8");
    const results = await runCliSearch(config, { query: "needle", status: "active", tag: "keep", limit: 1 });
    expect(formatCliSearch(results)).toContain("note-match\tnote\tactive");
    expect(formatCliSearch(results)).not.toContain("note-other");
    expect(formatCliSearch(results)).not.toContain("content");
    expect(formatCliSearch([])).toBe("No wiki documents matched.");
    await expect(runCliSearch(config, { query: "x".repeat(501) })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(runCliSearch(config, { query: "valid", limit: 21 })).rejects.toMatchObject({ code: "invalid_input" });
  });
});
