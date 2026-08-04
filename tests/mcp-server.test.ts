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
      const wikiCaptureTool = tools.tools.find((tool) => tool.name === "wiki_capture");
      const wikiUpdateTool = tools.tools.find((tool) => tool.name === "wiki_update");
      const wikiCaptureTypeSchema = wikiCaptureTool?.inputSchema.properties?.type as { enum?: string[] } | undefined;
      const wikiUpdateTypeSchema = wikiUpdateTool?.inputSchema.properties?.type as { enum?: string[] } | undefined;

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
        ]),
      );
      expect(lintResult.content[0]).toMatchObject({ type: "text" });
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
      expect(JSON.parse(lintResult.content[0]?.type === "text" ? lintResult.content[0].text : "{}"))
        .toMatchObject({ documentsChecked: 1, issues: [] });
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
    JSON.stringify(config),
    "utf8",
  );

  return workspacePath;
}
