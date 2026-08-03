#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { loadConfig } from "../core/index.js";
import {
  captureWikiDocument,
  getWikiDocumentById,
  listWikiDocuments,
  lintWikiDocuments,
  relateWikiDocuments,
  rebuildWikiIndex,
  searchWikiDocuments,
  updateWikiDocument,
} from "../wiki/index.js";

export function createThothMcpServer(): McpServer {
  const server = new McpServer({
    name: "thoth",
    version: "0.1.0",
  });

  server.registerTool(
    "wiki_search",
    {
      title: "Search Wiki",
      description: "Search Markdown wiki documents with optional metadata filters.",
      inputSchema: {
        query: z.string().min(1),
        type: z.string().optional(),
        status: z.string().optional(),
        tag: z.string().optional(),
      },
    },
    async (input) => {
      const config = await loadConfig();
      const results = await searchWikiDocuments(config, input.query, {
        type: input.type,
        status: input.status,
        tag: input.tag,
      });

      return jsonResult({ results });
    },
  );

  server.registerTool(
    "wiki_list",
    {
      title: "List Wiki Documents",
      description: "List wiki documents with optional metadata filters.",
      inputSchema: {
        type: z.string().optional(),
        status: z.string().optional(),
        tag: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input) => {
      const config = await loadConfig();
      const documents = await listWikiDocuments(config, input);

      return jsonResult({ documents });
    },
  );

  server.registerTool(
    "wiki_show",
    {
      title: "Show Wiki Document",
      description: "Read a wiki document by id.",
      inputSchema: {
        id: z.string().min(1),
        mode: z.enum(["content", "metadata", "raw"]).default("content"),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input) => {
      const config = await loadConfig();
      const document = await getWikiDocumentById(config, input.id);

      if (!document) {
        throw new Error(`Document not found: ${input.id}`);
      }

      if (input.mode === "metadata") {
        return jsonResult({ metadata: document.metadata });
      }

      if (input.mode === "raw") {
        return jsonResult({ raw: document.raw });
      }

      return jsonResult({
        id: document.id,
        title: document.title,
        type: document.type,
        status: document.status,
        tags: document.tags,
        path: document.path,
        content: document.content,
      });
    },
  );

  server.registerTool(
    "wiki_capture",
    {
      title: "Capture Wiki Document",
      description: "Capture content as a new wiki document.",
      inputSchema: {
        content: z.string().min(1),
        title: z.string().optional(),
        type: z.string().optional(),
        status: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
      },
    },
    async (input) => {
      const config = await loadConfig();
      const result = await captureWikiDocument(config, input);

      return jsonResult(result);
    },
  );

  server.registerTool(
    "wiki_update",
    {
      title: "Update Wiki Document",
      description: "Update simple metadata for an existing wiki document.",
      inputSchema: {
        id: z.string().min(1),
        title: z.string().optional(),
        type: z.string().optional(),
        status: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
      annotations: {
        readOnlyHint: false,
      },
    },
    async (input) => {
      const config = await loadConfig();
      const result = await updateWikiDocument(config, input);

      return jsonResult(result);
    },
  );

  server.registerTool(
    "wiki_relate",
    {
      title: "Relate Wiki Documents",
      description: "Create a relation from one existing wiki document to another.",
      inputSchema: {
        sourceId: z.string().min(1),
        targetId: z.string().min(1),
        relation: z.string().min(1),
      },
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
      },
    },
    async (input) => {
      const config = await loadConfig();
      const result = await relateWikiDocuments(config, input);

      return jsonResult(result);
    },
  );

  server.registerTool(
    "wiki_index",
    {
      title: "Rebuild Wiki Index",
      description: "Rebuild derived wiki index files.",
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      const config = await loadConfig();
      const result = await rebuildWikiIndex(config);

      return jsonResult(result);
    },
  );

  server.registerTool(
    "wiki_lint",
    {
      title: "Lint Wiki",
      description: "Validate wiki document consistency.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async () => {
      const config = await loadConfig();
      const result = await lintWikiDocuments(config);

      return jsonResult(result);
    },
  );

  return server;
}

export async function startThothMcpServer(): Promise<void> {
  const server = createThothMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

if (isDirectEntrypoint()) {
  if (process.argv.includes("--version")) {
    console.log("thoth-mcp 0.1.0");
  } else {
    await startThothMcpServer();
  }
}

function isDirectEntrypoint(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}
