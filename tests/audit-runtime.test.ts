import { appendFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listAuditEvents, recordAudit, redactAuditValue, verifyAudit } from "../src/audit/index.js";
import type { ResolvedThothConfig } from "../src/core/config.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("structured audit", () => {
  it("redacts sensitive keys recursively and truncates values", async () => {
    const config = await testConfig({ maxStringLength: 8, redactKeys: ["session"] });
    expect(redactAuditValue({ token: "secret", nested: { content: "private text", session: "hidden" }, id: "123456789" }, config)).toEqual({ token: "[REDACTED]", nested: { content: "[REDACTED]", session: "[REDACTED]" }, id: "12345678" });
  });

  it("reports JSON schema-invalid lines", async () => {
    const config = await testConfig();
    await recordAudit(config, { operation: "test", surface: "core", actor: "test", result: "executed", affectedIds: [], durationMs: 1 });
    const file = path.join(config.workspacePath, ".thoth", "audit.jsonl");
    await appendFile(file, '{"id":"bad"}\n', "utf8");
    const result = await verifyAudit(config);
    expect(result).toMatchObject({ valid: false, entries: 2 });
    expect(result.errors[0]).toContain("line 2");
  });

  it("keeps technical audit timestamps precise and independent of dateFormat", async () => {
    const config = await testConfig();
    await recordAudit(config, { operation: "timestamp-test", surface: "core", actor: "test", result: "executed", affectedIds: [], durationMs: 1 });
    const [event] = await listAuditEvents(config);
    expect(event?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("rejects invalid limits before reading", async () => {
    const config = await testConfig();
    await expect(listAuditEvents(config, 0)).rejects.toThrow("between 1 and 1000");
    await expect(listAuditEvents(config, 1.5)).rejects.toThrow("between 1 and 1000");
    await expect(listAuditEvents(config, 1001)).rejects.toThrow("between 1 and 1000");
  });
});

async function testConfig(audit: NonNullable<ResolvedThothConfig["audit"]> = {}): Promise<ResolvedThothConfig> {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "thoth-audit-test-"));
  roots.push(workspacePath);
  return { wikiPath: "wiki", defaultType: "note", defaultStatus: "draft", dateFormat: "YYYY-MM-DD", workspacePath, configPath: path.join(workspacePath, "thoth.config.json"), resolvedWikiPath: path.join(workspacePath, "wiki"), audit: { ...audit, path: ".thoth/audit.jsonl" } };
}
