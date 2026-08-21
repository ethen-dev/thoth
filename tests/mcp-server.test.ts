import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/core/index.js";
import { createThothMcpServer } from "../src/mcp/server.js";
import { initializeWiki } from "../src/wiki/index.js";

const tempDirectories: string[] = [];
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("MCP server", () => {
  it("lists tools and calls wiki_lint through an MCP client", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);
    await mkdir(path.join(config.resolvedWikiPath, "notes"), { recursive: true });
    await writeFile(path.join(config.resolvedWikiPath, "notes", "match.md"), "---\nid: note-match\ntitle: Match\ntype: note\nstatus: active\ntags: [keep]\n---\nneedle\n", "utf8");
    process.chdir(workspacePath);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createThothMcpServer();
    const client = new Client({ name: "thoth-test-client", version: "0.6.0" });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    try {
      const tools = await client.listTools();
      const resourceTemplates = await client.listResourceTemplates();
      const indexResource = await client.readResource({ uri: "thoth://wiki/index" });
      const projectResource = await client.readResource({ uri: "thoth://document/wiki-index" });
      const prompts = await client.listPrompts();
      const prompt = await client.getPrompt({
        name: "capture_memory",
        arguments: {
          content: "Remember this test fact.",
          intent: "test capture",
        },
      });
      const lintResult = await client.callTool({ name: "wiki_lint", arguments: {} });
      const skillListResult = await client.callTool({ name: "skill_list", arguments: {} });
      const skillShowResult = await client.callTool({ name: "skill_show", arguments: { id: "wiki-query" } });
      const skillValidateResult = await client.callTool({ name: "skill_validate", arguments: {} });
      const skillRunResult = await client.callTool({ name: "skill_run", arguments: { skillId: "wiki-query", input: { query: "not-present" }, mode: "execute" } });
      const skillErrorResult = await client.callTool({ name: "skill_run", arguments: { skillId: "wiki-query", input: {}, mode: "execute" } });
      const corePlanResult = await client.callTool({ name: "core_plan", arguments: { intent: "query", input: { query: "not-present" } } });
      const coreExecuteResult = await client.callTool({ name: "core_execute", arguments: { plan: JSON.parse(corePlanResult.content[0]?.type === "text" ? corePlanResult.content[0].text : "{}") } });
      const coreWritePlan = await client.callTool({ name: "core_plan", arguments: { intent: "capture", input: { content: "must confirm" } } });
      const coreWriteResult = await client.callTool({ name: "core_execute", arguments: { plan: JSON.parse(coreWritePlan.content[0]?.type === "text" ? coreWritePlan.content[0].text : "{}") } });
      const coreMalformedResult = await client.callTool({ name: "core_execute", arguments: { plan: [] } });
      const coreCrossedResult = await client.callTool({ name: "core_plan", arguments: { intent: "query", action: "wiki.show", input: { id: "wiki-index" } } });
      const captureProposalResult = await client.callTool({ name: "wiki_capture", arguments: { content: "mcp captured", title: "MCP captured" } });
      const captureProposal = JSON.parse(captureProposalResult.content[0]?.type === "text" ? captureProposalResult.content[0].text : "{}");
      const captureResult = await client.callTool({ name: "wiki_capture", arguments: { content: "mcp captured", title: "MCP captured", confirmed: true, confirmationToken: captureProposal.plan.confirmationToken } });
      const updateProposalResult = await client.callTool({ name: "wiki_update", arguments: { id: "note-match", title: "MCP updated" } });
      const updateProposal = JSON.parse(updateProposalResult.content[0]?.type === "text" ? updateProposalResult.content[0].text : "{}");
      const updateResult = await client.callTool({ name: "wiki_update", arguments: { id: "note-match", title: "MCP updated", confirmed: true, confirmationToken: updateProposal.plan.confirmationToken } });
      const appendProposalResult = await client.callTool({ name: "wiki_append", arguments: { id: "note-match", content: "mcp append" } });
      const appendProposal = JSON.parse(appendProposalResult.content[0]?.type === "text" ? appendProposalResult.content[0].text : "{}");
      const appendResult = await client.callTool({ name: "wiki_append", arguments: { id: "note-match", content: "mcp append", confirmed: true, confirmationToken: appendProposal.plan.confirmationToken } });
      const sourceProposalResult = await client.callTool({ name: "wiki_source_add", arguments: { content: "raw mcp", title: "MCP source" } });
      const sourceProposal = JSON.parse(sourceProposalResult.content[0]?.type === "text" ? sourceProposalResult.content[0].text : "{}");
      const sourceResult = await client.callTool({ name: "wiki_source_add", arguments: { content: "raw mcp", title: "MCP source", confirmed: true, confirmationToken: sourceProposal.plan.confirmationToken } });
      const sourcePayload = JSON.parse(sourceResult.content[0]?.type === "text" ? sourceResult.content[0].text : "{}");
      const sourceId = sourcePayload.results?.[0]?.id ?? "source-mcp-source";
      const linkProposalResult = await client.callTool({ name: "wiki_source_link", arguments: { sourceId, targetId: "note-match" } });
      const linkProposal = JSON.parse(linkProposalResult.content[0]?.type === "text" ? linkProposalResult.content[0].text : "{}");
      const linkResult = await client.callTool({ name: "wiki_source_link", arguments: { sourceId, targetId: "note-match", confirmed: true, confirmationToken: linkProposal.plan.confirmationToken } });
      const logProposalResult = await client.callTool({ name: "wiki_log", arguments: { content: "mcp log" } });
      const logProposal = JSON.parse(logProposalResult.content[0]?.type === "text" ? logProposalResult.content[0].text : "{}");
      const logResult = await client.callTool({ name: "wiki_log", arguments: { content: "mcp log", confirmed: true, confirmationToken: logProposal.plan.confirmationToken } });
      const configCoreResult = await client.callTool({ name: "core_plan", arguments: { intent: "config_update", input: {} } });
      const configSkillResult = await client.callTool({ name: "skill_run", arguments: { skillId: "wiki-config", input: {}, mode: "execute", confirmed: true } });
      const legacySearchResult = await client.callTool({ name: "wiki_search", arguments: { query: "not-present", limit: 1 } });
      const migratedSearchResult = await client.callTool({ name: "wiki_search", arguments: { query: "needle", status: "active", tag: "keep", limit: 1 } });
      const auditResult = await client.callTool({ name: "audit_list", arguments: { limit: 100 } });
      const longSearchResult = await client.callTool({ name: "wiki_search", arguments: { query: "x".repeat(501) } });
      const wikiCaptureTool = tools.tools.find((tool) => tool.name === "wiki_capture");
      const wikiUpdateTool = tools.tools.find((tool) => tool.name === "wiki_update");
      const wikiCaptureTypeSchema = wikiCaptureTool?.inputSchema.properties?.type as { enum?: string[] } | undefined;
      const wikiUpdateTypeSchema = wikiUpdateTool?.inputSchema.properties?.type as { enum?: string[] } | undefined;
      const skillRunTool = tools.tools.find((tool) => tool.name === "skill_run");
      const wikiSearchTool = tools.tools.find((tool) => tool.name === "wiki_search");

      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          "wiki_search",
          "wiki_list",
          "wiki_show",
          "wiki_capture",
          "wiki_update",
          "wiki_relate",
          "wiki_index",
          "wiki_lint",
          "wiki_log",
          "skill_list",
          "skill_show",
          "skill_validate",
          "skill_run",
        ]),
      );
      expect(lintResult.content[0]).toMatchObject({ type: "text" });
      expect(JSON.parse(skillListResult.content[0]?.type === "text" ? skillListResult.content[0].text : "{}").skills).toEqual(expect.arrayContaining([expect.objectContaining({ id: "wiki-query", path: "skills/llm-wiki/wiki-query.md" })]));
      expect(JSON.parse(skillShowResult.content[0]?.type === "text" ? skillShowResult.content[0].text : "{}")).toMatchObject({ id: "wiki-query", category: "llm-wiki" });
      expect(JSON.parse(skillValidateResult.content[0]?.type === "text" ? skillValidateResult.content[0].text : "{}")).toMatchObject({ ok: true });
      expect(JSON.parse(skillRunResult.content[0]?.type === "text" ? skillRunResult.content[0].text : "{}")).toMatchObject({ ok: true, skillId: "wiki-query", mode: "execute" });
      expect(JSON.parse(skillErrorResult.content[0]?.type === "text" ? skillErrorResult.content[0].text : "{}")).toMatchObject({ ok: false, error: { code: "invalid_input" } });
      expect(JSON.parse(corePlanResult.content[0]?.type === "text" ? corePlanResult.content[0].text : "{}")).toMatchObject({ status: "planned", steps: [{ action: "skill.wiki-query", write: false }] });
      expect(JSON.parse(coreExecuteResult.content[0]?.type === "text" ? coreExecuteResult.content[0].text : "{}")).toMatchObject({ ok: true, status: "executed" });
      expect(JSON.parse(coreWriteResult.content[0]?.type === "text" ? coreWriteResult.content[0].text : "{}")).toMatchObject({ status: "proposal", error: { code: "confirmation_required" } });
      expect(captureProposal).toMatchObject({ status: "proposal", error: { code: "confirmation_required" } });
      expect(JSON.parse(captureResult.content[0]?.type === "text" ? captureResult.content[0].text : "{}")).toMatchObject({ status: "executed" });
      expect(JSON.parse(updateResult.content[0]?.type === "text" ? updateResult.content[0].text : "{}")).toMatchObject({ status: "executed" });
      expect(JSON.parse(appendResult.content[0]?.type === "text" ? appendResult.content[0].text : "{}")).toMatchObject({ status: "executed" });
      expect(JSON.parse(sourceResult.content[0]?.type === "text" ? sourceResult.content[0].text : "{}")).toMatchObject({ status: "executed" });
      expect(JSON.parse(linkResult.content[0]?.type === "text" ? linkResult.content[0].text : "{}")).toMatchObject({ status: "executed" });
      expect(JSON.parse(logResult.content[0]?.type === "text" ? logResult.content[0].text : "{}")).toMatchObject({ status: "executed" });
      expect(JSON.parse(auditResult.content[0]?.type === "text" ? auditResult.content[0].text : "{}").events).toEqual(expect.arrayContaining([expect.objectContaining({ operation: "core.plan", surface: "mcp" })]));
      const auditEvents = JSON.parse(auditResult.content[0]?.type === "text" ? auditResult.content[0].text : "{}").events as Array<{ operation: string; surface: string; affectedIds: string[] }>;
      for (const [intent, count] of [["capture", 3], ["update", 2], ["append", 2], ["source_add", 2], ["source_link", 2], ["log", 2]] as const) {
        expect(auditEvents.filter((event) => event.operation === "core.plan" && event.surface === "mcp" && event.affectedIds.includes(intent))).toHaveLength(count);
      }
      expect(JSON.parse(coreMalformedResult.content[0]?.type === "text" ? coreMalformedResult.content[0].text : "{}")).toMatchObject({ ok: false, error: { code: "invalid_input" } });
      expect(JSON.parse(coreCrossedResult.content[0]?.type === "text" ? coreCrossedResult.content[0].text : "{}")).toMatchObject({ status: "error", error: { code: "not_allowlisted" } });
      expect(JSON.parse(configCoreResult.content[0]?.type === "text" ? configCoreResult.content[0].text : "{}")).toMatchObject({ status: "error", error: { code: "not_allowlisted" } });
      expect(JSON.parse(configSkillResult.content[0]?.type === "text" ? configSkillResult.content[0].text : "{}")).toMatchObject({ ok: false, error: { code: "provider_required" } });
      const legacySearch = JSON.parse(legacySearchResult.content[0]?.type === "text" ? legacySearchResult.content[0].text : "{}");
      expect(legacySearch.results).toEqual([]);
      const migratedSearch = JSON.parse(migratedSearchResult.content[0]?.type === "text" ? migratedSearchResult.content[0].text : "{}");
      expect(migratedSearch.results).toEqual([expect.objectContaining({ id: "note-match", snippet: expect.any(String) })]);
      expect(migratedSearch.results[0]).not.toHaveProperty("content");
      expect(longSearchResult.isError).toBe(true);
      expect(resourceTemplates.resourceTemplates.map((template) => template.uriTemplate))
        .toContain("thoth://document/{id}");
      expect(indexResource.contents[0]).toMatchObject({ mimeType: "text/markdown" });
      expect(projectResource.contents[0]).toMatchObject({ mimeType: "text/markdown" });
      expect(prompts.prompts.map((entry) => entry.name)).toContain("capture_memory");
      expect(prompt.messages[0]?.content).toMatchObject({
        type: "text",
        text: expect.stringContaining("wiki_capture"),
      });
      expect(wikiCaptureTypeSchema?.enum).not.toContain("source");
      expect(wikiUpdateTypeSchema?.enum).toContain("source");
      expect(skillRunTool?.annotations?.readOnlyHint).toBe(false);
      expect(skillRunTool?.annotations?.idempotentHint).toBeUndefined();
      expect(wikiSearchTool?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
      expect(JSON.parse(lintResult.content[0]?.type === "text" ? lintResult.content[0].text : "{}"))
        .toMatchObject({ documentsChecked: 3, issues: [] });
    } finally {
      await client.close();
      await server.close();
    }
  });
});

async function createWorkspace(config: { wikiPath: string }): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "thoth-mcp-test-"));
  tempDirectories.push(root);

  const workspacePath = path.join(root, "thoth");
  await mkdir(workspacePath, { recursive: true });
  await writeFile(
    path.join(workspacePath, "thoth.config.json"),
    JSON.stringify({ ...config, audit: { enabled: true, path: "audit.jsonl" } }),
    "utf8",
  );

  return workspacePath;
}
