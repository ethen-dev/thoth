import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executePlan, loadConfig, maxCorePlanSteps, planIntent } from "../src/core/index.js";
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
    expect((await executePlan(config, write, { confirmed: true })).status).toBe("executed");
    expect(await readFile(filePath, "utf8")).toContain("confirmed");
    for (const intent of ["update", "append"] as const) {
      const input = intent === "update" ? { id: "note-fact", title: "Changed" } : { id: "note-fact", content: "more" };
      const proposal = await executePlan(config, planIntent(config, { intent, input }));
      expect(proposal.error?.code).toBe("confirmation_required");
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
    expect(planIntent(config, { intent: "relate", input: { sourceId: "a", targetId: "b", relation: "related_to" } }).error?.code).toBe("non_atomic_action");
    expect(planIntent(config, { intent: "log", input: { content: "x" } }).error?.code).toBe("non_atomic_action");
    const tooLarge = { version: 1, intent: "list", status: "planned", confirmationRequired: false, steps: Array.from({ length: maxCorePlanSteps + 1 }, (_, index) => ({ id: `step-${index}`, action: "wiki.list", input: {}, write: false, summary: "list" })) };
    expect((await executePlan(config, tooLarge)).error?.code).toBe("plan_too_large");
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
