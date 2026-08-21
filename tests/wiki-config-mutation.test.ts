import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, planIntent } from "../src/core/index.js";
import * as coreApi from "../src/core/index.js";
import { runSkill } from "../src/skills/index.js";
import { listAuditEvents, recordAudit } from "../src/audit/index.js";

describe("wiki-config mutation", () => {
  it("validates the allowlist, stays read-only in dry-run, and preserves fields", async () => {
    const root = await workspace();
    const config = await loadConfig(root);
    const provider = { complete: () => ({ version: 1, summary: "change defaults", actions: [{ intent: "config_update", input: { changes: { defaultStatus: "active" } } }] }) };
    const before = await readFile(config.configPath, "utf8");
    const dry = await runSkill(config, { skillId: "wiki-config", mode: "dry-run", input: {} }, provider);
    expect(dry).toMatchObject({ ok: true, readOnly: true, data: { dryRun: true } });
    expect(await readFile(config.configPath, "utf8")).toBe(before);
    const planned = await runSkill(config, { skillId: "wiki-config", mode: "plan", input: {} }, provider);
    const token = (planned.data as { confirmationToken: string }).confirmationToken;
    expect(await runSkill(config, { skillId: "wiki-config", mode: "execute", input: {}, confirmed: true, confirmationToken: token }, provider)).toMatchObject({ ok: true, status: "executed", readOnly: false });
    const next = JSON.parse(await readFile(config.configPath, "utf8"));
    expect(next).toMatchObject({ wikiPath: "wiki", defaultType: "note", defaultStatus: "active", audit: { actor: "tester" } });
    await rm(root, { recursive: true, force: true });
  });

  it("rejects forbidden, nested, no-op, and stale proposals", async () => {
    const root = await workspace();
    const config = await loadConfig(root);
    const forbidden = (input: unknown) => ({ complete: () => ({ version: 1, summary: "bad", actions: [{ intent: "config_update", input }] }) });
    expect(await runSkill(config, { skillId: "wiki-config", mode: "plan", input: {} }, forbidden({ changes: { wikiPath: "elsewhere" } }))).toMatchObject({ error: { code: "invalid_proposal" } });
    expect(await runSkill(config, { skillId: "wiki-config", mode: "plan", input: {} }, forbidden({ changes: { audit: { enabled: false } } }))).toMatchObject({ error: { code: "invalid_proposal" } });
    expect(await runSkill(config, { skillId: "wiki-config", mode: "plan", input: {} }, forbidden({ changes: { defaultType: { nested: true } } }))).toMatchObject({ error: { code: "invalid_proposal" } });
    expect(await runSkill(config, { skillId: "wiki-config", mode: "plan", input: {} }, forbidden({ changes: { defaultType: "note" } }))).toMatchObject({ error: { code: "change_has_no_effect" } });
    const provider = forbidden({ changes: { defaultStatus: "active" } });
    const planned = await runSkill(config, { skillId: "wiki-config", mode: "plan", input: {} }, provider);
    const token = (planned.data as { confirmationToken: string }).confirmationToken;
    await writeFile(config.configPath, JSON.stringify({ wikiPath: "wiki", defaultType: "note", defaultStatus: "draft" }), "utf8");
    expect(await runSkill(config, { skillId: "wiki-config", mode: "execute", input: {}, confirmed: true, confirmationToken: token }, provider)).toMatchObject({ error: { code: "confirmation_mismatch" } });
    const events = await listAuditEvents(config);
    expect(events.some((event) => event.operation === "skill.wiki-config.plan")).toBe(true);
    expect(JSON.stringify(events)).not.toContain("active");
    await rm(root, { recursive: true, force: true });
  });

  it("keeps config_update out of public Core and rejects invalid complete configs", async () => {
    const root = await workspace();
    const config = await loadConfig(root);
    expect(planIntent(config, { intent: "config_update", input: {} })).toMatchObject({ status: "error", error: { code: "not_allowlisted" } });
    await writeFile(config.configPath, JSON.stringify({ wikiPath: "wiki", audit: { maxEntryBytes: 1 } }), "utf8");
    await expect(loadConfig(root)).rejects.toThrow(/audit.maxEntryBytes/);
    await writeFile(config.configPath, JSON.stringify({ wikiPath: "wiki", audit: { actor: "Bearer super-secret" } }), "utf8");
    const sensitiveConfig = await loadConfig(root);
    await recordAudit(sensitiveConfig, { operation: "test.sensitive", surface: "skill", actor: sensitiveConfig.audit?.actor ?? "system", result: "planned", affectedIds: [], durationMs: 0 });
    expect(JSON.stringify(await listAuditEvents(sensitiveConfig))).not.toContain("super-secret");
    await rm(root, { recursive: true, force: true });
  });

  it("does not expose an unsafe updateConfig bypass", async () => {
    const root = await workspace();
    const config = await loadConfig(root);
    expect(coreApi).not.toHaveProperty("updateConfig");
    expect(coreApi).not.toHaveProperty("planConfigMutation");
    const invalid = (changes: unknown) => ({ complete: () => ({ version: 1, summary: "invalid", actions: [{ intent: "config_update", input: { changes } }] }) });
    for (const changes of [{ defaultStatus: 42 }, { wikiPath: "elsewhere" }, { audit: { enabled: false } }, { defaultType: "note", extra: "blocked" }, { dateFormat: "invalid" }]) {
      expect((await runSkill(config, { skillId: "wiki-config", mode: "plan", input: {} }, invalid(changes))).ok).toBe(false);
    }
    await rm(root, { recursive: true, force: true });
  });
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "thoth-config-"));
  await writeFile(path.join(root, "thoth.config.json"), JSON.stringify({ wikiPath: "wiki", defaultType: "note", defaultStatus: "draft", dateFormat: "YYYY-MM-DD", audit: { actor: "tester" } }), "utf8");
  return root;
}
