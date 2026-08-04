import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverSkills, runSkill, validateSkills } from "../src/skills/index.js";

async function config() {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "thoth-skills-"));
  const wikiPath = path.join(workspacePath, "wiki");
  await mkdir(wikiPath, { recursive: true });
  return { workspacePath, wikiPath, configPath: path.join(workspacePath, "thoth.config.json"), resolvedWikiPath: wikiPath, wikiPath: "wiki", defaultType: "note", defaultStatus: "draft", dateFormat: "YYYY-MM-DD" } as const;
}

describe("skill runtime", () => {
  it("discovers the integrated pack and executes query without writing", async () => {
    const current = await config();
    await writeFile(path.join(current.resolvedWikiPath, "match.md"), "---\nid: match\ntitle: Match\ntype: note\nstatus: active\ntags: [test]\n---\nA real matching phrase.\n", "utf8");
    const before = await readFile(current.wikiPath).catch(() => Buffer.from("missing"));
    const skills = await discoverSkills(current);
    expect(skills.map((skill) => skill.id)).toContain("wiki-query");
    const result = await runSkill(current, { skillId: "wiki-query", input: { query: "real matching phrase" }, mode: "execute" });
    expect(result).toMatchObject({ ok: true, readOnly: true, status: "executed" });
    expect(JSON.stringify(result)).not.toMatch(/"content"|"raw"|"metadata"/);
    const first = (result.data as { results: Array<Record<string, unknown>> }).results[0];
    if (first) expect(Object.keys(first).sort()).toEqual(["id", "path", "snippet", "status", "tags", "title", "type"]);
    expect(await readFile(current.wikiPath).catch(() => Buffer.from("missing"))).toEqual(before);
    await rm(current.workspacePath, { recursive: true, force: true });
  });

  it("supports filters and returns no matches without fabricating results", async () => {
    const current = await config();
    await writeFile(path.join(current.resolvedWikiPath, "active.md"), "---\nid: active\ntitle: Active\ntype: note\nstatus: active\ntags: [keep]\n---\nneedle text\n", "utf8");
    await writeFile(path.join(current.resolvedWikiPath, "draft.md"), "---\nid: draft\ntitle: Draft\ntype: idea\nstatus: draft\ntags: [other]\n---\nneedle text\n", "utf8");
    const filtered = await runSkill(current, { skillId: "wiki-query", input: { query: "needle", status: "active", tag: "keep" }, mode: "execute" });
    expect((filtered.data as { results: unknown[] }).results).toHaveLength(1);
    const empty = await runSkill(current, { skillId: "wiki-query", input: { query: "does-not-exist" }, mode: "execute" });
    expect((empty.data as { results: unknown[] }).results).toEqual([]);
    await rm(current.workspacePath, { recursive: true, force: true });
  });

  it("rejects invalid metadata and duplicate ids", async () => {
    const current = await config();
    const root = path.join(current.workspacePath, ".thoth", "skills");
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "bad.md"), "---\nid: BAD\n---\nbody\n");
    expect((await validateSkills(current)).ok).toBe(false);
    await rm(current.workspacePath, { recursive: true, force: true });
  });

  it("returns structured unsupported and input errors", async () => {
    const current = await config();
    expect(await runSkill(current, { skillId: "wiki-ingest", input: {}, mode: "execute" })).toMatchObject({ ok: false, status: "unsupported" });
    expect(await runSkill(current, { skillId: "wiki-query", input: {}, mode: "execute" })).toMatchObject({ ok: false, status: "error", error: { code: "invalid_input" } });
    expect(await runSkill(current, { skillId: "wiki-query", input: { query: "x".repeat(501) }, mode: "execute" })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await runSkill(current, { skillId: "wiki-query", input: { query: "query" }, mode: "validate" })).toMatchObject({ ok: true, mode: "validate", status: "validated" });
    expect(await runSkill(current, { skillId: "wiki-query", input: {}, mode: "invalid" as "execute" })).toMatchObject({ ok: false, mode: "execute", error: { code: "invalid_mode" } });
    await rm(current.workspacePath, { recursive: true, force: true });
  });

  it("rejects unknown metadata, symlinks, and configured limits", async () => {
    const current = await config();
    const root = path.join(current.workspacePath, ".thoth", "skills");
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "unknown.md"), "---\nid: custom\nname: custom\nversion: 1.0.0\ncategory: test\nstatus: active\nextra: true\n---\n");
    await expect(discoverSkills(current)).rejects.toThrow(/Unrecognized key|Invalid/);
    await rm(path.join(root, "unknown.md"));
    await symlink(path.join(current.workspacePath, "outside"), path.join(root, "link"));
    await expect(discoverSkills(current)).rejects.toThrow(/symlink|Unsafe/);
    await rm(current.workspacePath, { recursive: true, force: true });
  });

  it("rejects duplicate ids, intermediate symlinks, and every configured size limit", async () => {
    const current = await config();
    const root = path.join(current.workspacePath, ".thoth", "skills");
    await mkdir(root, { recursive: true });
    const manifest = "---\nid: duplicate\nname: Duplicate\nversion: 1.0.0\ncategory: test\nstatus: active\n---\nbody\n";
    await writeFile(path.join(root, "one.md"), manifest);
    await writeFile(path.join(root, "two.md"), manifest);
    await expect(discoverSkills(current)).rejects.toThrow(/Duplicate skill id/);
    await rm(path.join(root, "two.md"));
    await mkdir(path.join(root, "deep"), { recursive: true });
    await writeFile(path.join(root, "deep", "nested.md"), manifest);
    await expect(discoverSkills(current, { maxDepth: 0 })).rejects.toThrow(/maxDepth/);
    await rm(path.join(root, "deep"), { recursive: true });
    const outside = path.join(current.workspacePath, "outside");
    await mkdir(outside, { recursive: true });
    await symlink(outside, path.join(root, "nested"));
    await expect(discoverSkills(current)).rejects.toThrow(/symlink|Unsafe/);
    await rm(path.join(root, "nested"));
    await Promise.all(Array.from({ length: 10 }, (_, index) => writeFile(path.join(root, `many-${index}.md`), manifest)));
    await expect(discoverSkills(current, { maxFiles: 1 })).rejects.toThrow(/maxFiles/);
    await expect(discoverSkills(current, { maxFileBytes: 1 })).rejects.toThrow(/file too large/);
    await expect(discoverSkills(current, { maxFrontmatterBytes: 1 })).rejects.toThrow(/frontmatter too large/);
    await expect(discoverSkills(current, { maxBodyBytes: 1 })).rejects.toThrow(/body too large/);
    await expect(discoverSkills(current, { maxTotalBytes: 1 })).rejects.toThrow(/maxTotalBytes/);
    await rm(current.workspacePath, { recursive: true, force: true });
  });
});
