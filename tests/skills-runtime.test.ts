import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverSkills, runSkill, validateSkills } from "../src/skills/index.js";
import { initializeWiki } from "../src/wiki/index.js";
import { listAuditEvents, verifyAudit } from "../src/audit/index.js";

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
    const before = await readFile(path.join(current.resolvedWikiPath, "match.md"));
    const skills = await discoverSkills(current);
    expect(skills.map((skill) => skill.id)).toContain("wiki-query");
    expect(skills.find((skill) => skill.id === "wiki-query")?.primary_agent).toBe("librarian");
    const result = await runSkill(current, { skillId: "wiki-query", input: { query: "real matching phrase" }, mode: "execute" });
    expect(result).toMatchObject({ ok: true, readOnly: true, status: "executed" });
    expect(JSON.stringify(result)).not.toMatch(/"content"|"raw"|"metadata"/);
    const first = (result.data as { results: Array<Record<string, unknown>> }).results[0];
    if (first) expect(Object.keys(first).sort()).toEqual(["id", "path", "snippet", "status", "tags", "title", "type"]);
    expect(await readFile(path.join(current.resolvedWikiPath, "match.md"))).toEqual(before);
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

  it("requires an injected provider and validates proposals before use", async () => {
    const current = await config();
    expect(await runSkill(current, { skillId: "wiki-ingest", input: {}, mode: "execute" })).toMatchObject({ error: { code: "provider_required" } });
    const invalid = { complete: () => ({ version: 1, summary: "bad", actions: [{ intent: "capture", input: {} }, { intent: "capture", input: {} }] }) };
    expect(await runSkill(current, { skillId: "wiki-ingest", input: {}, mode: "plan" }, invalid)).toMatchObject({ error: { code: "invalid_proposal" } });
    await rm(current.workspacePath, { recursive: true, force: true });
  });

  it("keeps dry-run read-only, requires confirmation, and executes one safe action", async () => {
    const current = await config();
    await initializeWiki(current);
    const before = await listFiles(current.resolvedWikiPath);
    const target = path.join(current.resolvedWikiPath, "notes", "note-safe.md");
    const provider = { complete: (request: { documentation: string }) => {
      expect(request.documentation).toContain("Markdown");
      return { version: 1, summary: "capture", actions: [{ intent: "capture", input: { id: "note-safe", title: "Safe", type: "note", content: "$(touch owned)" } }] };
    } };
    expect(await runSkill(current, { skillId: "wiki-ingest", input: {}, mode: "dry-run", confirmed: true }, provider)).toMatchObject({ ok: true, mode: "dry-run" });
    expect(await listFiles(current.resolvedWikiPath)).toEqual(before);
    expect(await readFile(target).catch(() => undefined)).toBeUndefined();
    const proposal = await runSkill(current, { skillId: "wiki-ingest", input: {}, mode: "plan" }, provider);
    const token = (proposal.data as { confirmationToken: string }).confirmationToken;
    expect(await runSkill(current, { skillId: "wiki-ingest", input: {}, mode: "execute" }, provider)).toMatchObject({ ok: true, error: { code: "confirmation_required" } });
    expect(await runSkill(current, { skillId: "wiki-ingest", input: {}, mode: "execute", confirmed: true }, provider)).toMatchObject({ ok: false, error: { code: "confirmation_token_required" } });
    expect(await runSkill(current, { skillId: "wiki-ingest", input: {}, mode: "execute", confirmed: true, confirmationToken: token }, provider)).toMatchObject({ ok: true, status: "executed" });
    expect(await readFile(path.join(current.resolvedWikiPath, "notes", "note-safe.md"), "utf8")).toContain("$(touch owned)");
    expect((await verifyAudit(current)).valid).toBe(true);
    expect((await listAuditEvents(current)).some((event) => event.operation === "skill.wiki-ingest.execute")).toBe(true);
    await rm(current.workspacePath, { recursive: true, force: true });
  });

  it("rejects non-atomic proposals and preserves wikiPath without overwriting", async () => {
    const current = await config();
    await initializeWiki(current);
    const existing = path.join(current.resolvedWikiPath, "notes", "note-configured.md");
    await writeFile(existing, "---\nid: note-configured\ntitle: Existing\ntype: note\nstatus: active\ntags: []\n---\nexisting\n", "utf8");
    const configProvider = { complete: () => ({ version: 1, summary: "config", actions: [{ intent: "capture", input: { id: "note-configured", title: "Configured", type: "note", content: "new" } }] }) };
    expect(await runSkill(current, { skillId: "wiki-config", input: {}, mode: "execute", confirmed: true }, configProvider)).toMatchObject({ ok: false, error: { code: "skill_action_not_allowed" } });
    const nonAtomic = { complete: () => ({ version: 1, summary: "relate", actions: [{ intent: "relate", input: { sourceId: "a", targetId: "b", relation: "supports" } }] }) };
    expect(await runSkill(current, { skillId: "wiki-integrate", input: {}, mode: "execute", confirmed: true }, nonAtomic)).toMatchObject({ error: { code: "non_atomic_action" } });
    await rm(current.workspacePath, { recursive: true, force: true });
  });

  it("rejects cross-skill actions and changed reviewed proposals", async () => {
    const current = await config();
    const cross = { complete: () => ({ version: 1, summary: "cross", actions: [{ intent: "append", input: { id: "note-x", content: "x" } }] }) };
    expect(await runSkill(current, { skillId: "wiki-ingest", input: {}, mode: "plan" }, cross)).toMatchObject({ error: { code: "skill_action_not_allowed" } });
    let changed = false;
    const provider = { complete: () => ({ version: 1, summary: changed ? "changed" : "stable", actions: [{ intent: "capture", input: { id: "note-token", title: "Token", type: "note", content: "x" } }] }) };
    const planned = await runSkill(current, { skillId: "wiki-ingest", input: {}, mode: "plan" }, provider);
    const token = (planned.data as { confirmationToken: string }).confirmationToken;
    changed = true;
    expect(await runSkill(current, { skillId: "wiki-ingest", input: {}, mode: "execute", confirmed: true, confirmationToken: token }, provider)).toMatchObject({ error: { code: "confirmation_mismatch" } });
    await rm(current.workspacePath, { recursive: true, force: true });
  });
});

async function listFiles(directory: string): Promise<string[]> {
  const entries = await (await import("node:fs/promises")).readdir(directory, { withFileTypes: true });
  return entries.map((entry) => entry.name).sort();
}
