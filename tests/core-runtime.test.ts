import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executePlan, loadConfig, maxCorePlanSteps, planIntent, planIntentAudited, statusThroughCore, doctorThroughCore, listAuditEvents } from "../src/core/index.js";
import { captureWikiDocument, initializeWiki } from "../src/wiki/index.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("structured Core runtime", () => {
  it("plans reads and requires confirmation for writes", async () => {
    const config = await workspace();
    const read = planIntent(config, { intent: "list", input: {} });
    const write = planIntent(config, { intent: "capture", input: { content: "fact" } });
    expect(read.steps[0]).toMatchObject({ action: "wiki.list", write: false });
    expect(write.steps[0]).toMatchObject({ action: "wiki.capture", write: true });
    expect((await executePlan(config, write)).status).toBe("proposal");
  });

  it("executes confirmed writes and does not expose full query documents", async () => {
    const config = await workspace();
    await captureWikiDocument(config, { content: "A durable fact", title: "Fact", type: "note" });
    const query = planIntent(config, { intent: "query", input: { query: "durable" } });
    const result = await executePlan(config, query);
    expect(result.results?.[0]).toMatchObject({ results: [expect.objectContaining({ title: "Fact", snippet: expect.any(String) })] });
    expect(result.results?.[0]).not.toHaveProperty("content");
    const write = planIntent(config, { intent: "capture", input: { content: "confirmed", title: "Confirmed" } });
    const filePath = path.join(config.resolvedWikiPath, "notes", "note-confirmed.md");
    await expect(access(filePath)).rejects.toThrow();
    expect((await executePlan(config, write)).error?.code).toBe("confirmation_required");
    await expect(access(filePath)).rejects.toThrow();
    expect((await executePlan(config, write, { confirmed: true })).error?.code).toBe("confirmation_required");
    expect((await executePlan(config, write, { confirmed: true, confirmationToken: write.confirmationToken })).status).toBe("executed");
    const tokenWithoutConfirmation = planIntent(config, { intent: "capture", input: { content: "token is not confirmation", title: "Token only" } });
    expect((await executePlan(config, tokenWithoutConfirmation, { confirmationToken: tokenWithoutConfirmation.confirmationToken })).status).toBe("proposal");
    await expect(access(path.join(config.resolvedWikiPath, "notes", "note-token-only.md"))).rejects.toThrow();
    expect(await readFile(filePath, "utf8")).toContain("confirmed");
    for (const intent of ["update", "append"] as const) {
      const input = intent === "update" ? { id: "note-fact", title: "Changed" } : { id: "note-fact", content: "more" };
      const proposal = await executePlan(config, planIntent(config, { intent, input }));
      expect(proposal.error?.code).toBe("confirmation_required");
      if (intent === "append") {
        const intentPlan = planIntent(config, { intent, input });
        const executed = await executePlan(config, intentPlan, { confirmed: true, confirmationToken: intentPlan.confirmationToken });
        expect(executed.results?.[0]).toMatchObject({ updated: true, section: "Notes" });
      }
    }
  });

  it("rejects unknown intents and invalid inputs", async () => {
    const config = await workspace();
    expect(planIntent(config, { intent: "model.call" }).error?.code).toBe("not_allowlisted");
    expect(planIntent(config, { intent: "query", input: {} }).error?.code).toBe("invalid_input");
    expect(planIntent(config, { intent: "query", input: { query: "x".repeat(501) } }).error?.code).toBe("invalid_input");
    expect(planIntent(config, { intent: "query", action: "wiki.show", input: { id: "x" } }).error?.code).toBe("not_allowlisted");
    expect((await executePlan(config, { steps: [] } as never)).error?.code).toBe("invalid_input");
    const multiWrite = { version: 1, intent: "capture", status: "planned", confirmationRequired: true, steps: [
      { id: "a", action: "wiki.capture", input: { content: "a" }, write: true, summary: "a" },
      { id: "b", action: "wiki.capture", input: { content: "b" }, write: true, summary: "b" },
    ] };
    expect((await executePlan(config, multiWrite)).error?.code).toBe("non_atomic_plan");
    expect(planIntent(config, { intent: "relate", input: { sourceId: "a", targetId: "b", relation: "related_to" } })).toMatchObject({ status: "planned", confirmationRequired: true, steps: [{ action: "wiki.relate", write: true }] });
    expect(planIntent(config, { intent: "log", input: { content: "x" } }).steps[0]).toMatchObject({ action: "wiki.log", write: true });
    const tooLarge = { version: 1, intent: "list", status: "planned", confirmationRequired: false, steps: Array.from({ length: maxCorePlanSteps + 1 }, (_, index) => ({ id: `step-${index}`, action: "wiki.list", input: {}, write: false, summary: "list" })) };
    expect((await executePlan(config, tooLarge)).error?.code).toBe("plan_too_large");
  });

  it("provides read-only status and diagnostic doctor intents", async () => {
    const config = await workspace();
    const statusPlan = planIntent(config, { intent: "status", input: {} });
    const doctorPlan = planIntent(config, { intent: "doctor", input: {} });
    expect(statusPlan).toMatchObject({ status: "planned", steps: [{ action: "wiki.status", write: false }] });
    expect(doctorPlan).toMatchObject({ status: "planned", steps: [{ action: "wiki.doctor", write: false }] });
    const status = await statusThroughCore(config);
    expect(status).toMatchObject({ wikiExists: true, indexExists: true });
    const before = await readFile(path.join(config.resolvedWikiPath, "index.md"), "utf8");
    const result = await doctorThroughCore(config);
    expect(result).toMatchObject({ ok: false, checks: expect.arrayContaining([
      { name: "index", status: "pass", message: "Index exists (not rebuilt by diagnostic doctor)" },
      { name: "index.md", status: "pass", message: "Readable and valid (not regenerated)" },
      { name: ".thoth/index.json", status: "fail", message: expect.stringContaining("no such file") },
      { name: ".thoth/relations.json", status: "fail", message: expect.stringContaining("no such file") },
    ]) });
    expect(await readFile(path.join(config.resolvedWikiPath, "index.md"), "utf8")).toBe(before);
    expect({
      status: {
        ...status,
        workspacePath: "<workspace>",
        configPath: "<config>",
        wikiPath: "<wiki>",
      },
      doctor: {
        ok: result.ok,
        checks: result.checks.map((check) => ({ ...check, message: check.message.replaceAll(config.resolvedWikiPath, "<wiki>").replaceAll(config.configPath, "<config>") })),
      },
    }).toMatchInlineSnapshot(`
      {
        "doctor": {
          "checks": [
            {
              "message": "Loaded <config>",
              "name": "config",
              "status": "pass",
            },
            {
              "message": "Wiki exists at <wiki>",
              "name": "wiki",
              "status": "pass",
            },
            {
              "message": "Required directories exist",
              "name": "structure",
              "status": "pass",
            },
            {
              "message": "No issues across 2 documents",
              "name": "lint",
              "status": "pass",
            },
            {
              "message": "Index exists (not rebuilt by diagnostic doctor)",
              "name": "index",
              "status": "pass",
            },
            {
              "message": "Readable and valid (not regenerated)",
              "name": "index.md",
              "status": "pass",
            },
            {
              "message": "ENOENT: no such file or directory, open '<wiki>/.thoth/index.json'",
              "name": ".thoth/index.json",
              "status": "fail",
            },
            {
              "message": "ENOENT: no such file or directory, open '<wiki>/.thoth/relations.json'",
              "name": ".thoth/relations.json",
              "status": "fail",
            },
          ],
          "ok": false,
        },
        "status": {
          "configPath": "<config>",
          "indexExists": true,
          "missingDirectories": [],
          "wikiExists": true,
          "wikiPath": "<wiki>",
          "workspacePath": "<workspace>",
        },
      }
    `);
    const events = await listAuditEvents(config, 100);
    expect(events.filter((event) => ["status", "doctor"].includes(event.affectedIds[0] ?? "") && event.surface === "core")).toHaveLength(4);
  });

  it("relates one source document through a confirmed, idempotent Core plan", async () => {
    const config = await workspace();
    await captureWikiDocument(config, { content: "source", title: "Source", type: "note" });
    await captureWikiDocument(config, { content: "target", title: "Target", type: "note" });
    const sourcePath = path.join(config.resolvedWikiPath, "notes", "note-source.md");
    const targetPath = path.join(config.resolvedWikiPath, "notes", "note-target.md");
    const indexPath = path.join(config.resolvedWikiPath, "index.md");
    const beforeIndex = await readFile(indexPath, "utf8");
    const plan = await planIntentAudited(config, { intent: "relate", input: { sourceId: "note-source", targetId: "note-target", relation: "related_to" } }, "cli");
    expect(plan).toMatchObject({ status: "planned", confirmationRequired: true, steps: [{ action: "wiki.relate", write: true }] });
    expect((await executePlan(config, plan, { surface: "cli" })).status).toBe("proposal");
    expect(await readFile(sourcePath, "utf8")).not.toContain("note-target");
    expect((await executePlan(config, plan, { confirmed: true, confirmationToken: "wrong", surface: "cli" })).error?.code).toBe("confirmation_required");
    expect((await executePlan(config, plan, { confirmed: true, surface: "cli" })).error?.code).toBe("confirmation_required");
    const executed = await executePlan(config, plan, { confirmed: true, confirmationToken: plan.confirmationToken, surface: "cli" });
    expect(executed).toMatchObject({ status: "executed", results: [{ source: "note-source", target: "note-target", created: true }] });
    expect((await executePlan(config, plan, { confirmed: true, confirmationToken: plan.confirmationToken, surface: "cli" })).results?.[0]).toMatchObject({ created: false });
    expect(await readFile(targetPath, "utf8")).not.toContain("note-source");
    expect(await readFile(indexPath, "utf8")).toBe(beforeIndex);
    const audit = await listAuditEvents(config, 100);
    expect(audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: "core.plan", surface: "cli", affectedIds: ["relate"] }),
      expect.objectContaining({ operation: "core.executed", surface: "cli", affectedIds: ["relate"] }),
    ]));
  });

  it("plans index rebuilds with dry-run, confirmation tokens and idempotent atomic output", async () => {
    const config = await workspace();
    await captureWikiDocument(config, { content: "indexed", title: "Indexed", type: "note" });
    const dry = planIntent(config, { intent: "index", input: { dryRun: true, human: true } });
    expect(dry).toMatchObject({ status: "planned", confirmationRequired: false, steps: [{ action: "wiki.index", write: false }] });
    expect((await executePlan(config, dry, { surface: "cli" })).status).toBe("executed");
    await expect(access(path.join(config.resolvedWikiPath, ".thoth", "index.json"))).rejects.toThrow();

    await writeFile(path.join(config.resolvedWikiPath, "index-idea.md"), "---\nid: wiki-index-idea\ntitle: Obsolete\ntype: reference\nstatus: active\nsource: generated\n---\n", "utf8");
    const plan = planIntent(config, { intent: "index", input: { human: true, categoryPages: true } });
    expect(plan.confirmationToken).toEqual(expect.any(String));
    expect((await executePlan(config, plan, { surface: "mcp" })).status).toBe("proposal");
    expect((await executePlan(config, plan, { confirmed: true, confirmationToken: "wrong", surface: "mcp" })).error?.code).toBe("confirmation_required");
    expect((await executePlan(config, plan, { confirmed: true, confirmationToken: plan.confirmationToken, surface: "mcp" })).status).toBe("executed");
    await expect(access(path.join(config.resolvedWikiPath, "index-idea.md"))).rejects.toThrow();
    const index = await readFile(path.join(config.resolvedWikiPath, ".thoth", "index.json"), "utf8");
    const relations = await readFile(path.join(config.resolvedWikiPath, ".thoth", "relations.json"), "utf8");
    expect((await executePlan(config, plan, { confirmed: true, confirmationToken: plan.confirmationToken })).status).toBe("executed");
    expect(await readFile(path.join(config.resolvedWikiPath, ".thoth", "index.json"), "utf8")).toBe(index);
    expect(await readFile(path.join(config.resolvedWikiPath, ".thoth", "relations.json"), "utf8")).toBe(relations);
  });

  it("rejects human-only index options unless human is explicitly enabled", async () => {
    const config = await workspace();
    for (const input of [{ curated: true }, { categoryPages: true }, { type: "note" }, { maxPerSection: 1 }]) {
      expect(planIntent(config, { intent: "index", input })).toMatchObject({ status: "error", error: { code: "invalid_input" } });
    }
  });

  it("rolls back a partial initialization, including the lock-created directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "thoth-init-rollback-"));
    roots.push(root);
    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, { recursive: true });
    await writeFile(path.join(workspacePath, "thoth.config.json"), JSON.stringify({ wikiPath: "wiki" }));
    const config = await loadConfig(workspacePath);
    await expect(initializeWiki(config, { beforeFileWrite: async (fileName) => {
      if (fileName === "log.md") throw new Error("simulated disk failure");
    } })).rejects.toThrow("simulated disk failure");
    await expect(access(config.resolvedWikiPath)).rejects.toThrow();
    await expect(access(path.join(config.resolvedWikiPath, ".thoth"))).rejects.toThrow();
  });
});

async function workspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "thoth-core-test-"));
  roots.push(root);
  const workspacePath = path.join(root, "workspace");
  await mkdir(workspacePath, { recursive: true });
  await writeFile(path.join(workspacePath, "thoth.config.json"), JSON.stringify({ wikiPath: "wiki" }));
  const config = await loadConfig(workspacePath);
  await initializeWiki(config);
  return config;
}
