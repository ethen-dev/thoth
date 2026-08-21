#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import {
  getWikiDocumentById,
  validLogKinds,
  validWikiCaptureDocumentTypes,
  validWikiDocumentTypes,
  validWikiRelationTypes,
} from "../actions/index.js";
import { executePlan, loadConfig, planIntentAudited, queryThroughCore, listThroughCore, showThroughCore, lintThroughCore, statusThroughCore, doctorThroughCore, initThroughCore, writeThroughCore, sourceListThroughCore, sourceShowThroughCore } from "../core/index.js";
import { discoverSkills, getSkill, runSkill, validateSkills } from "../skills/index.js";
import { listAuditEvents } from "../audit/index.js";

export function createThothMcpServer(): McpServer {
  const server = new McpServer({
    name: "thoth",
    version: "0.6.0",
  });

  server.registerResource(
    "wiki_index",
    "thoth://wiki/index",
    {
      title: "Wiki Index",
      description: "Root Markdown index of the configured wiki.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const config = await loadConfig();
      const document = await getWikiDocumentById(config, "wiki-index");

      if (!document) {
        throw new Error("Wiki index document not found: wiki-index");
      }

      return textResource(uri.href, document.raw, "text/markdown");
    },
  );

  server.registerResource(
    "wiki_document",
    new ResourceTemplate("thoth://document/{id}", { list: undefined }),
    {
      title: "Wiki Document",
      description: "Raw Markdown for a wiki document by id.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const id = String(variables.id);
      const config = await loadConfig();
      const document = await getWikiDocumentById(config, id);

      if (!document) {
        throw new Error(`Document not found: ${id}`);
      }

      return textResource(uri.href, document.raw, "text/markdown");
    },
  );

  server.registerPrompt(
    "capture_memory",
    {
      title: "Capture Memory",
      description: "Guide an LLM through capturing durable knowledge into T.H.O.T.H.",
      argsSchema: {
        content: z.string().min(1),
        intent: z.string().optional(),
      },
    },
    (input) => ({
      description: "A sober capture workflow for T.H.O.T.H. memory.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Actua como T.H.O.T.H., un agente de memoria sereno y preciso.",
              "Evalua si el contenido debe guardarse como conocimiento durable.",
              "Primero busca contexto relacionado con `wiki_search` si hay dudas de duplicado o continuidad.",
              "Si debe guardarse, usa `wiki_capture` con tipo, titulo y tags concretos.",
              "Si pertenece a un documento existente, prefiere actualizar o relacionar antes de crear duplicados.",
              "Responde con una confirmacion breve, el ID/ruta resultante y cualquier relacion importante.",
              `Intencion: ${input.intent ?? "captura de memoria"}`,
              `Contenido: ${input.content}`,
            ].join("\n"),
          },
        },
      ],
    }),
  );

   server.registerTool(
    "wiki_search",
    {
      title: "Search Wiki",
      description: "Search Markdown wiki documents with optional metadata filters.",
      inputSchema: {
        query: z.string().trim().min(1).max(500),
        type: z.enum(validWikiDocumentTypes).optional(),
        status: z.string().optional(),
        tag: z.string().optional(),
        limit: z.number().int().min(1).max(20).default(20),
      },
       annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input) => {
      const config = await loadConfig();
      const results = await queryThroughCore(config, {
        query: input.query,
        type: input.type,
        status: input.status,
        tag: input.tag,
        limit: input.limit,
      }, "mcp");

      return jsonResult({ results });
    },
  );

  server.registerTool(
    "wiki_list",
    {
      title: "List Wiki Documents",
      description: "List wiki documents with optional metadata filters.",
      inputSchema: {
        type: z.enum(validWikiDocumentTypes).optional(),
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
       const documents = await listThroughCore(config, input, "mcp") as unknown[];

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
       const document = await showThroughCore(config, input.id, input.mode, "mcp") as { id?: string; title?: string; type?: string; status?: string; tags?: string[]; path?: string; content?: string; metadata?: unknown; raw?: string };

       if (input.mode === "metadata") {
         return jsonResult(document);
      }

      if (input.mode === "raw") {
         return jsonResult(document);
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
    "wiki_init",
    { title: "Initialize Wiki", description: "Plan and initialize the wiki without overwriting existing files.", inputSchema: { dryRun: z.boolean().optional(), confirmed: z.boolean().optional(), confirmationToken: z.string().min(1).optional() }, annotations: { readOnlyHint: false, idempotentHint: true } },
    async (input) => jsonResult(await initThroughCore(await loadConfig(), input, "mcp")),
  );

  server.registerTool(
    "wiki_capture",
    {
      title: "Capture Wiki Document",
      description: "Capture content as a new wiki document.",
      inputSchema: {
        content: z.string().min(1),
        title: z.string().optional(),
        type: z.enum(validWikiCaptureDocumentTypes).optional(),
        status: z.string().optional(),
        tags: z.array(z.string()).optional(),
        projectId: z.string().optional(),
        confirmed: z.boolean().optional(),
        confirmationToken: z.string().min(1).optional(),
      },
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
      },
    },
    async (input) => {
       const config = await loadConfig();
       const { confirmed, confirmationToken, ...payload } = input;
       const result = await writeThroughCore(config, { intent: "capture", input: payload }, { confirmed, confirmationToken, surface: "mcp" });

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
        type: z.enum(validWikiDocumentTypes).optional(),
        status: z.string().optional(),
        tags: z.array(z.string()).optional(),
        confirmed: z.boolean().optional(),
        confirmationToken: z.string().min(1).optional(),
      },
      annotations: {
        readOnlyHint: false,
      },
    },
    async (input) => {
       const config = await loadConfig();
       const { confirmed, confirmationToken, ...payload } = input;
       const result = await writeThroughCore(config, { intent: "update", input: payload }, { confirmed, confirmationToken, surface: "mcp" });

      return jsonResult(result);
    },
  );

  server.registerTool(
    "wiki_append",
    { title: "Append Wiki Document", description: "Append content to a wiki document section.", inputSchema: { id: z.string().min(1), content: z.string().min(1), section: z.string().optional(), confirmed: z.boolean().optional(), confirmationToken: z.string().min(1).optional() }, annotations: { readOnlyHint: false } },
    async (input) => { const { confirmed, confirmationToken, ...payload } = input; return jsonResult(await writeThroughCore(await loadConfig(), { intent: "append", input: payload }, { confirmed, confirmationToken, surface: "mcp" })); },
  );

  server.registerTool(
    "wiki_source_list",
    { title: "List Source Documents", description: "List raw source documents.", inputSchema: { status: z.string().optional(), tag: z.string().optional() }, annotations: { readOnlyHint: true, idempotentHint: true } },
async (input) => jsonResult({ documents: await sourceListThroughCore(await loadConfig(), input, "mcp") }),
  );
  server.registerTool(
    "wiki_source_show",
    { title: "Show Source Document", description: "Read a raw source document.", inputSchema: { id: z.string().min(1), mode: z.enum(["content", "metadata", "raw"]).default("content") }, annotations: { readOnlyHint: true, idempotentHint: true } },
async (input) => jsonResult(await sourceShowThroughCore(await loadConfig(), input.id, input.mode, "mcp")),
  );
  server.registerTool(
    "wiki_source_add",
    { title: "Add Source Document", description: "Add raw content as a source document; confirmation is required.", inputSchema: { content: z.string().min(1), title: z.string().min(1), id: z.string().optional(), status: z.string().optional(), tags: z.array(z.string()).optional(), confirmed: z.boolean().optional(), confirmationToken: z.string().min(1).optional() }, annotations: { readOnlyHint: false } },
    async (input) => { const { confirmed, confirmationToken, ...payload } = input; return jsonResult(await writeThroughCore(await loadConfig(), { intent: "source_add", input: payload }, { confirmed, confirmationToken, surface: "mcp" })); },
  );
  server.registerTool(
    "wiki_source_link",
    { title: "Link Source Document", description: "Link a source to a derived document; confirmation is required.", inputSchema: { sourceId: z.string().min(1), targetId: z.string().min(1), confirmed: z.boolean().optional(), confirmationToken: z.string().min(1).optional() }, annotations: { readOnlyHint: false } },
    async (input) => { const { confirmed, confirmationToken, ...payload } = input; return jsonResult(await writeThroughCore(await loadConfig(), { intent: "source_link", input: payload }, { confirmed, confirmationToken, surface: "mcp" })); },
  );

  server.registerTool(
    "wiki_relate",
    {
      title: "Relate Wiki Documents",
       description: "Plan and execute a relation; derived link synchronization is opt-in and atomic.",
      inputSchema: {
        sourceId: z.string().min(1),
        targetId: z.string().min(1),
          relation: z.enum(validWikiRelationTypes),
          syncLinks: z.boolean().optional(),
         confirmed: z.boolean().optional(),
         confirmationToken: z.string().min(1).optional(),
      },
      annotations: {
        readOnlyHint: false,
      },
    },
    async (input) => {
      const config = await loadConfig();
      const { confirmed, confirmationToken, ...payload } = input;
      const result = await writeThroughCore(config, { intent: "relate", input: payload }, { confirmed, confirmationToken, surface: "mcp" });

      return jsonResult(result);
    },
  );

  server.registerTool(
    "wiki_sync_links",
    { title: "Sync Wiki Relation Links", description: "Plan and execute derived Markdown relation links atomically.", inputSchema: { dryRun: z.boolean().optional(), confirmed: z.boolean().optional(), confirmationToken: z.string().min(1).optional() }, annotations: { readOnlyHint: false, idempotentHint: true } },
    async (input) => {
      const { confirmed, confirmationToken, ...payload } = input;
      return jsonResult(await writeThroughCore(await loadConfig(), { intent: "sync_links", input: payload }, { confirmed, confirmationToken, surface: "mcp" }));
    },
  );

  server.registerTool(
    "wiki_index",
    {
      title: "Rebuild Wiki Index",
       description: "Rebuild derived wiki index files.",
       inputSchema: { human: z.boolean().optional(), dryRun: z.boolean().optional(), curated: z.boolean().optional(), categoryPages: z.boolean().optional(), type: z.enum(validWikiDocumentTypes).optional(), maxPerSection: z.number().int().min(0).optional(), confirmed: z.boolean().optional(), confirmationToken: z.string().min(1).optional() },
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
      },
    },
     async (input) => {
      const config = await loadConfig();
      const { confirmed, confirmationToken, ...payload } = input;
      return jsonResult(await writeThroughCore(config, { intent: "index", input: payload }, { confirmed, confirmationToken, surface: "mcp" }));
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
       const result = await lintThroughCore(config, "mcp");

      return jsonResult(result);
    },
  );

  server.registerTool(
    "wiki_status",
    { title: "Show Workspace Status", description: "Read workspace status without changing files.", inputSchema: z.object({}).strict(), annotations: { readOnlyHint: true, idempotentHint: true } },
    async () => jsonResult(await statusThroughCore(await loadConfig(), "mcp")),
  );

  server.registerTool(
    "wiki_doctor",
    { title: "Diagnose Wiki", description: "Diagnose workspace and wiki health without rebuilding indexes or writing files.", inputSchema: z.object({}).strict(), annotations: { readOnlyHint: true, idempotentHint: true } },
    async () => jsonResult(await doctorThroughCore(await loadConfig(), "mcp")),
  );

  server.registerTool(
    "wiki_log",
    {
      title: "Append Log Entry",
      description: "Append an entry to the global log and optionally a project timeline.",
      inputSchema: {
        content: z.string().min(1),
        kind: z.enum(validLogKinds).optional(),
        project: z.string().optional(),
        ref: z.string().optional(),
        confirmed: z.boolean().optional(),
        confirmationToken: z.string().min(1).optional(),
      },
      annotations: {
        readOnlyHint: false,
      },
    },
    async (input) => {
      const config = await loadConfig();
       const result = await writeThroughCore(config, { intent: "log", input: {
         content: input.content,
         kind: input.kind,
         projectId: input.project,
         ref: input.ref,
        } }, { confirmed: input.confirmed, confirmationToken: input.confirmationToken, surface: "mcp" });

      return jsonResult(result);
    },
  );

  server.registerTool("skill_list", { title: "List Skills", description: "List discovered skill metadata.", annotations: { readOnlyHint: true, idempotentHint: true } }, async () => jsonResult({ skills: (await discoverSkills(await loadConfig())).map(({ body: _body, ...manifest }) => manifest) }));
  server.registerTool("audit_list", { title: "List Audit Events", description: "Read bounded structured audit events without prompts or content.", inputSchema: { limit: z.number().int().min(1).max(1000).default(100) }, annotations: { readOnlyHint: true, idempotentHint: true } }, async ({ limit }) => jsonResult({ events: await listAuditEvents(await loadConfig(), limit) }));
   server.registerTool("core_plan", { title: "Plan Core Intent", description: "Plan a structured provider-agnostic Core intent without writing.", inputSchema: { intent: z.string().min(1), input: z.record(z.string(), z.unknown()).optional(), action: z.string().optional() }, annotations: { readOnlyHint: true, idempotentHint: true } }, async (input) => jsonResult(await planIntentAudited(await loadConfig(), input, "mcp")));
   server.registerTool("core_execute", { title: "Execute Core Plan", description: "Execute a Core plan; writes require confirmation.", inputSchema: { plan: z.unknown(), confirmed: z.boolean().optional(), confirmationToken: z.string().min(1).optional() }, annotations: { readOnlyHint: false } }, async (input) => jsonResult(await executePlan(await loadConfig(), input.plan, { confirmed: input.confirmed, confirmationToken: input.confirmationToken, surface: "mcp" })));
  server.registerTool("skill_show", { title: "Show Skill", description: "Show one discovered skill without executing its Markdown body.", inputSchema: { id: z.string().min(1) }, annotations: { readOnlyHint: true, idempotentHint: true } }, async ({ id }) => {
    const skill = await getSkill(await loadConfig(), id);
    if (!skill) throw new Error(`Skill not found: ${id}`);
    const { body: _body, ...manifest } = skill;
    return jsonResult(manifest);
  });
  server.registerTool("skill_validate", { title: "Validate Skills", description: "Validate skill manifests.", annotations: { readOnlyHint: true, idempotentHint: true } }, async () => jsonResult(await validateSkills(await loadConfig())));
   server.registerTool("skill_run", { title: "Run Skill", description: "Run a skill without executing shell, Markdown, or implicit providers. Trusted adapters are injected through the API.", inputSchema: { skillId: z.string().min(1), input: z.record(z.string(), z.unknown()).optional(), mode: z.enum(["validate", "plan", "dry-run", "execute"]).default("execute"), confirmed: z.boolean().optional(), confirmationToken: z.string().min(1).optional() }, annotations: { readOnlyHint: false } }, async (input) => jsonResult(await runSkill(await loadConfig(), input)));

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

function textResource(uri: string, text: string, mimeType: string) {
  return {
    contents: [
      {
        uri,
        text,
        mimeType,
      },
    ],
  };
}

if (isDirectEntrypoint()) {
  if (process.argv.includes("--version")) {
    console.log("thoth-mcp 0.6.0");
  } else {
    await startThothMcpServer();
  }
}

function isDirectEntrypoint(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}
