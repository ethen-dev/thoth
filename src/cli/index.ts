#!/usr/bin/env node

import { Command } from "commander";
import {
  getAgent,
  listAgents,
  registerExternalAgent,
  unregisterExternalAgent,
  validateAgents,
} from "../agents/index.js";
import {
  addWikiSourceDocument,
  appendLogEntry,
  appendWikiDocument,
  captureWikiDocument,
  getWikiDocumentById,
  getWikiStatus,
  initializeWiki,
  listWikiDocuments,
  linkWikiSourceDocument,
  lintWikiDocuments,
  relateWikiDocuments,
  rebuildHumanWikiIndex,
  rebuildWikiIndex,
  runWikiDoctor,
  searchWikiDocuments,
  syncWikiRelationLinks,
  updateWikiDocument,
  validLogKinds,
  validWikiCaptureDocumentTypes,
  validWikiDocumentTypes,
  validWikiRelationTypes,
} from "../actions/index.js";
import { executePlan, loadConfig, planIntent, type IntentRequest, type ThothPlan } from "../core/index.js";
import { discoverSkills, getSkill, runSkill, validateSkills } from "../skills/index.js";

const thothVersion = "0.6.0";
const program = new Command();
const documentTypeHelp = `Document type (${validWikiDocumentTypes.join(", ")})`;
const captureDocumentTypeHelp = `Document type (${validWikiCaptureDocumentTypes.join(", ")}); use source add for source documents`;
const relationTypeHelp = `Relation type (${validWikiRelationTypes.join(", ")})`;

program
  .name("thoth")
  .description("T.H.O.T.H. local operations CLI")
  .version(thothVersion);

const core = program.command("core").description("Structured provider-agnostic Core API");
core.command("plan").requiredOption("--input <json>", "IntentRequest JSON").action(async (options: { input: string }) => {
  try {
    const request = parseJson<IntentRequest>(options.input);
    const plan = planIntent(await loadConfig(), request);
    console.log(JSON.stringify(plan, null, 2));
    if (plan.status === "error") process.exitCode = 1;
  } catch (error) { reportCoreError(error); }
});
core.command("execute").requiredOption("--input <json>", "ThothPlan JSON").option("--confirmed", "Allow write steps").action(async (options: { input: string; confirmed?: boolean }) => {
  try {
    const plan = parseJson<ThothPlan>(options.input);
    const result = await executePlan(await loadConfig(), plan, { confirmed: options.confirmed });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) { reportCoreError(error); }
});

program
  .command("init")
  .description("Initialize the configured LLM Wiki workspace")
  .action(async () => {
    try {
      const config = await loadConfig();
      const result = await initializeWiki(config);

      console.log(`Wiki path: ${result.wikiPath}`);
      console.log(`Directories created: ${result.createdDirectories.length}`);
      console.log(`Index: ${result.index}`);
      console.log("T.H.O.T.H. wiki is ready.");
    } catch (error) {
      reportError(error);
    }
  });

program
  .command("status")
  .description("Show workspace status")
  .action(async () => {
    try {
      const config = await loadConfig();
      const status = await getWikiStatus(config);

      console.log(`Workspace: ${status.workspacePath}`);
      console.log(`Config: ${status.configPath}`);
      console.log(`Wiki: ${status.wikiPath}`);
      console.log(`Wiki exists: ${status.wikiExists ? "yes" : "no"}`);
      console.log(`Index exists: ${status.indexExists ? "yes" : "no"}`);
      console.log(
        `Missing directories: ${
          status.missingDirectories.length > 0
            ? status.missingDirectories.join(", ")
            : "none"
        }`,
      );
    } catch (error) {
      reportError(error);
    }
  });

program
  .command("list")
  .description("List wiki documents")
  .option("--type <type>", documentTypeHelp)
  .option("--status <status>", "Filter by document status")
  .option("--tag <tag>", "Filter by tag")
  .action(async (options: { type?: string; status?: string; tag?: string }) => {
    try {
      const config = await loadConfig();
      const documents = await listWikiDocuments(config, options);

      if (documents.length === 0) {
        console.log("No wiki documents found.");
        return;
      }

      for (const document of documents) {
        console.log(
          `${document.id}\t${document.type}\t${document.status}\t${document.title}\t${document.path}`,
        );
      }
    } catch (error) {
      reportError(error);
    }
  });

program
  .command("show")
  .description("Show a wiki document by id")
  .argument("<id>", "Document id")
  .option("--raw", "Print raw Markdown including frontmatter")
  .option("--metadata", "Print document metadata as JSON")
  .action(
    async (
      id: string,
      options: { raw?: boolean; metadata?: boolean },
    ) => {
      try {
        const config = await loadConfig();
        const document = await getWikiDocumentById(config, id);

        if (!document) {
          throw new Error(`Document not found: ${id}`);
        }

        if (options.raw) {
          console.log(document.raw);
          return;
        }

        if (options.metadata) {
          console.log(JSON.stringify(document.metadata, null, 2));
          return;
        }

        console.log(document.content.trimEnd());
      } catch (error) {
        reportError(error);
      }
    },
  );

program
  .command("capture")
  .description("Capture content into the configured LLM Wiki")
  .argument("<content>", "Content to capture")
  .option("--type <type>", captureDocumentTypeHelp)
  .option("--title <title>", "Document title")
  .option("--status <status>", "Document status")
  .option("--project <id>", "Project id (required for tasks)")
  .option("--tag <tag>", "Document tag. Can be used multiple times", collectValues, [])
  .action(
    async (
      content: string,
      options: {
        type?: string;
        title?: string;
        status?: string;
        tag?: string[];
        project?: string;
      },
    ) => {
      try {
        const config = await loadConfig();
        const result = await captureWikiDocument(config, {
          content,
          title: options.title,
          type: options.type,
          status: options.status,
          tags: options.tag,
          projectId: options.project,
        });

        console.log(`Document: ${result.id}`);
        console.log(`Path: ${result.path}`);
        console.log(`Status: ${result.created ? "created" : "exists"}`);
      } catch (error) {
        reportError(error);
      }
    },
  );

program
  .command("append")
  .description("Append content to a wiki document section")
  .argument("<id>", "Document id")
  .argument("<content>", "Content to append")
  .option("--section <section>", "Section heading", "Notes")
  .action(
    async (
      id: string,
      content: string,
      options: { section: string },
    ) => {
      try {
        const config = await loadConfig();
        const result = await appendWikiDocument(config, {
          id,
          content,
          section: options.section,
        });

        console.log(`Document: ${result.id}`);
        console.log(`Path: ${result.path}`);
        console.log(`Section: ${result.section}`);
      } catch (error) {
        reportError(error);
      }
    },
  );

program
  .command("log")
  .description("Append an entry to the global log and optionally a project timeline")
  .argument("<content>", "Log entry content")
  .option("--kind <kind>", `Log kind (${validLogKinds.join(", ")})`)
  .option("--project <id>", "Project id to also append to its timeline")
  .option("--ref <id>", "Referenced document id")
  .action(
    async (
      content: string,
      options: { kind?: string; project?: string; ref?: string },
    ) => {
      try {
        const config = await loadConfig();
        const result = await appendLogEntry(config, {
          content,
          kind: options.kind,
          projectId: options.project,
          ref: options.ref,
        });

        console.log(`Global log: ${result.globalPath}`);

        if (result.timelinePath) {
          console.log(`Timeline: ${result.timelinePath}`);
        }

        if (options.project) {
          console.log(`Project: ${options.project}`);
        }
      } catch (error) {
        reportError(error);
      }
    },
  );

program
  .command("search")
  .description("Search wiki documents")
  .argument("<query>", "Search query")
  .option("--type <type>", documentTypeHelp)
  .option("--status <status>", "Filter by document status")
  .option("--tag <tag>", "Filter by tag")
  .option("--limit <n>", "Maximum results (1-20)", "20")
  .action(
    async (
      query: string,
      options: { type?: string; status?: string; tag?: string; limit: string },
    ) => {
      try {
        const config = await loadConfig();
        const limit = Number(options.limit);
        const results = await searchWikiDocuments(config, query, { ...options, limit });

        if (results.length === 0) {
          console.log("No wiki documents matched.");
          return;
        }

        for (const result of results) {
          console.log(
            `${result.id}\t${result.type}\t${result.status}\t${result.title}\t${result.path}`,
          );
          console.log(`  ${result.snippet}`);
        }
      } catch (error) {
        reportError(error);
      }
    },
  );

program
  .command("index")
  .description("Rebuild derived wiki indexes and optionally the human index")
  .option("--human", "Also rebuild the human Markdown index.md")
  .option("--curated", "Use the conservative human view")
  .option("--category-pages", "Generate exhaustive per-type human index pages")
  .option("--type <type>", documentTypeHelp)
  .option("--max-per-section <n>", "Limit entries in the main human index")
  .action(async (options: { human?: boolean; curated?: boolean; categoryPages?: boolean; type?: string; maxPerSection?: string }) => {
    try {
      validateHumanIndexOptions(options);
      const config = await loadConfig();
      const result = await rebuildWikiIndex(config);

      console.log(`Documents indexed: ${result.documentsIndexed}`);
      console.log(`Relations indexed: ${result.relationsIndexed}`);
      console.log(`Index: ${result.indexPath}`);
      console.log(`Relations: ${result.relationsPath}`);

      if (result.warnings.length > 0) {
        console.log("Warnings:");

        for (const warning of result.warnings) {
          console.log(`- ${warning}`);
        }
      }

      if (options.human) {
        const maxPerSection = options.maxPerSection === undefined ? undefined : Number(options.maxPerSection);
        const humanIndex = await rebuildHumanWikiIndex(config, {
          curated: options.curated,
          categoryPages: options.categoryPages,
          type: options.type,
          maxPerSection,
        });

        console.log(`Human index documents: ${humanIndex.documentsIndexed}`);
        console.log(`Human index relations: ${humanIndex.relationsIndexed}`);
        console.log(`Human index: ${humanIndex.indexPath}`);
        if (humanIndex.categoryPages?.length) {
          console.log(`Category pages: ${humanIndex.categoryPages.join(", ")}`);
        }
      }
    } catch (error) {
      reportError(error);
    }
  });

program
  .command("lint")
  .description("Validate wiki document consistency")
  .action(async () => {
    try {
      const config = await loadConfig();
      const result = await lintWikiDocuments(config);

      console.log(`Documents checked: ${result.documentsChecked}`);

      if (result.issues.length === 0) {
        console.log("Issues: none");
        return;
      }

      console.log(`Issues: ${result.issues.length}`);

      for (const issue of result.issues) {
        console.log(`- ${issue.path}: ${issue.message}`);
      }

      process.exitCode = 1;
    } catch (error) {
      reportError(error);
    }
  });

program
  .command("sync-links")
  .description("Sync Markdown relation links from frontmatter related metadata")
  .action(async () => {
    try {
      const config = await loadConfig();
      const result = await syncWikiRelationLinks(config);

      console.log(`Documents checked: ${result.documentsChecked}`);
      console.log(`Documents updated: ${result.documentsUpdated}`);
      console.log(`Links created: ${result.linksCreated}`);
    } catch (error) {
      reportError(error);
    }
  });

program
  .command("update")
  .description("Update wiki document metadata")
  .argument("<id>", "Document id")
  .option("--title <title>", "Document title")
  .option("--type <type>", `${documentTypeHelp}; cannot convert documents to or from source`)
  .option("--status <status>", "Document status")
  .option("--tag <tag>", "Tag to append. Can be used multiple times", collectValues, [])
  .action(
    async (
      id: string,
      options: {
        title?: string;
        type?: string;
        status?: string;
        tag?: string[];
      },
    ) => {
      try {
        const config = await loadConfig();
        const result = await updateWikiDocument(config, {
          id,
          title: options.title,
          type: options.type,
          status: options.status,
          tags: options.tag,
        });

        console.log(`Document: ${result.id}`);
        console.log(`Path: ${result.path}`);
        console.log(`Title: ${result.title}`);
        console.log(`Type: ${result.type}`);
        console.log(`Status: ${result.status}`);
        console.log(`Tags: ${result.tags.length > 0 ? result.tags.join(", ") : "none"}`);
      } catch (error) {
        reportError(error);
      }
    },
  );

program
  .command("relate")
  .description("Create a relation between wiki documents")
  .argument("<source>", "Source document id")
  .argument("<target>", "Target document id")
  .requiredOption("--relation <relation>", relationTypeHelp)
  .action(
    async (
      source: string,
      target: string,
      options: { relation: string },
    ) => {
      try {
        const config = await loadConfig();
        const result = await relateWikiDocuments(config, {
          sourceId: source,
          targetId: target,
          relation: options.relation,
        });

        console.log(`Source: ${result.source}`);
        console.log(`Target: ${result.target}`);
        console.log(`Relation: ${result.relation}`);
        console.log(`Path: ${result.path}`);
        console.log(`Status: ${result.created ? "created" : "exists"}`);
      } catch (error) {
        reportError(error);
      }
    },
  );

const source = program
  .command("source")
  .description("Manage raw source documents");

source
  .command("add")
  .description("Add raw content as a source document")
  .argument("<content>", "Raw source content")
  .requiredOption("--title <title>", "Source title")
  .option("--id <id>", "Source id (must match source-<slug>)")
  .option("--status <status>", "Source status")
  .option("--tag <tag>", "Source tag. Can be used multiple times", collectValues, [])
  .action(
    async (
      content: string,
      options: { title: string; id?: string; status?: string; tag?: string[] },
    ) => {
      try {
        const config = await loadConfig();
        const result = await addWikiSourceDocument(config, {
          content,
          title: options.title,
          id: options.id,
          status: options.status,
          tags: options.tag,
        });

        console.log(`Source: ${result.id}`);
        console.log(`Path: ${result.path}`);
        console.log(`Status: ${result.created ? "created" : "exists"}`);
      } catch (error) {
        reportError(error);
      }
    },
  );

source
  .command("list")
  .description("List source documents")
  .option("--status <status>", "Filter by source status")
  .option("--tag <tag>", "Filter by tag")
  .action(async (options: { status?: string; tag?: string }) => {
    try {
      const config = await loadConfig();
      const documents = await listWikiDocuments(config, { ...options, type: "source" });

      if (documents.length === 0) {
        console.log("No source documents found.");
        return;
      }

      for (const document of documents) {
        console.log(
          `${document.id}\t${document.type}\t${document.status}\t${document.title}\t${document.path}`,
        );
      }
    } catch (error) {
      reportError(error);
    }
  });

source
  .command("show")
  .description("Show a source document by id")
  .argument("<id>", "Source document id")
  .option("--raw", "Print raw Markdown including frontmatter")
  .option("--metadata", "Print document metadata as JSON")
  .action(
    async (
      id: string,
      options: { raw?: boolean; metadata?: boolean },
    ) => {
      try {
        const config = await loadConfig();
        const document = await getWikiDocumentById(config, id);

        if (!document) {
          throw new Error(`Source document not found: ${id}`);
        }

        if (document.type !== "source") {
          throw new Error(`Document is not a source: ${id}`);
        }

        if (options.raw) {
          console.log(document.raw);
          return;
        }

        if (options.metadata) {
          console.log(JSON.stringify(document.metadata, null, 2));
          return;
        }

        console.log(document.content.trimEnd());
      } catch (error) {
        reportError(error);
      }
    },
  );

source
  .command("link")
  .description("Link a source to a derived document")
  .argument("<source-id>", "Source document id")
  .argument("<document-id>", "Derived document id")
  .action(async (sourceId: string, documentId: string) => {
    try {
      const config = await loadConfig();
      const result = await linkWikiSourceDocument(config, sourceId, documentId);

      console.log(`Source: ${result.source}`);
      console.log(`Document: ${result.target}`);
      console.log(`Source relation: ${result.sourceRelation.created ? "created" : "exists"}`);
      console.log(`Document relation: ${result.targetRelation.created ? "created" : "exists"}`);
    } catch (error) {
      reportError(error);
    }
  });

program
  .command("doctor")
  .description("Diagnose workspace and wiki health")
  .action(async () => {
    try {
      const config = await loadConfig();
      const result = await runWikiDoctor(config);

      console.log(`CLI version: ${thothVersion}`);
      console.log(`MCP version: ${thothVersion}`);

      for (const check of result.checks) {
        console.log(`${check.status === "pass" ? "PASS" : "FAIL"}\t${check.name}\t${check.message}`);
      }

      if (!result.ok) {
        process.exitCode = 1;
      }
    } catch (error) {
      reportError(error);
    }
  });

const agents = program
  .command("agents")
  .description("Manage T.H.O.T.H. agent registries");

agents
  .command("list")
  .description("List registered agents")
  .option("--source <source>", "Filter by source: internal or external")
  .option("--category <category>", "Filter by category")
  .action(async (options: { source?: "internal" | "external"; category?: string }) => {
    try {
      const config = await loadConfig();
      const results = await listAgents(config, options);

      for (const agent of results) {
        console.log(`${agent.id}\t${agent.source}\t${agent.runtime}\t${agent.category}\t${agent.status}\t${agent.path}`);
      }
    } catch (error) {
      reportError(error);
    }
  });

agents
  .command("show")
  .description("Show a registered agent")
  .argument("<id>", "Agent id")
  .action(async (id: string) => {
    try {
      const config = await loadConfig();
      const agent = await getAgent(config, id);

      if (!agent) {
        throw new Error(`Agent not found: ${id}`);
      }

      console.log(JSON.stringify(agent, null, 2));
    } catch (error) {
      reportError(error);
    }
  });

agents
  .command("register")
  .description("Register an external Markdown agent")
  .argument("<path>", "Path to agent Markdown file")
  .action(async (agentPath: string) => {
    try {
      const config = await loadConfig();
      const agent = await registerExternalAgent(config, agentPath);

      console.log(`Registered: ${agent.id}`);
      console.log(`Path: ${agent.path}`);
    } catch (error) {
      reportError(error);
    }
  });

agents
  .command("unregister")
  .description("Unregister an external agent")
  .argument("<id>", "Agent id")
  .action(async (id: string) => {
    try {
      const config = await loadConfig();
      const removed = await unregisterExternalAgent(config, id);

      console.log(removed ? `Unregistered: ${id}` : `Agent not found: ${id}`);
    } catch (error) {
      reportError(error);
    }
  });

agents
  .command("validate")
  .description("Validate registered agents")
  .action(async () => {
    try {
      const config = await loadConfig();
      const result = await validateAgents(config);

      console.log(`Agents checked: ${result.agentsChecked}`);

      if (result.issues.length === 0) {
        console.log("Issues: none");
        return;
      }

      console.log(`Issues: ${result.issues.length}`);
      for (const issue of result.issues) {
        console.log(`- ${issue.id} (${issue.path}): ${issue.message}`);
      }
      process.exitCode = 1;
    } catch (error) {
      reportError(error);
    }
  });

const skills = program.command("skills").description("Discover and run safe, allowlisted skills");
skills.command("list").description("List discovered skills").action(async () => {
  try { const config = await loadConfig(); for (const skill of await discoverSkills(config)) console.log(`${skill.id}\t${skill.version}\t${skill.category}\t${skill.status}\t${skill.path}`); } catch (error) { reportError(error); }
});
skills.command("show").argument("<id>", "Skill id").description("Show skill metadata").action(async (id: string) => {
  try { const skill = await getSkill(await loadConfig(), id); if (!skill) throw new Error(`Skill not found: ${id}`); console.log(JSON.stringify({ ...skill, body: undefined }, null, 2)); } catch (error) { reportError(error); }
});
skills.command("validate").description("Validate discovered skill metadata").action(async () => {
  try { const result = await validateSkills(await loadConfig()); console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1; } catch (error) { reportError(error); }
});
skills.command("run").argument("<id>", "Skill id").requiredOption("--input <json>", "JSON input (query: {query,type?,status?,tag?}; lint: {})").option("--mode <mode>", "validate or execute", "execute").description("Run a read-only skill handler").action(async (id: string, options: { input: string; mode: "validate" | "execute" }) => {
  try { let input: unknown; try { input = JSON.parse(options.input); } catch { throw new Error("--input must be valid JSON"); } const result = options.mode === "validate" || options.mode === "execute" ? await runSkill(await loadConfig(), { skillId: id, input, mode: options.mode }) : await runSkill(await loadConfig(), { skillId: id, input, mode: options.mode as "execute" }); console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1; } catch (error) { reportError(error); }
});

program.parse();

function reportError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`T.H.O.T.H. cannot proceed: ${message}`);
  process.exit(1);
}

function reportCoreError(error: unknown): never {
  console.error(JSON.stringify({ ok: false, status: "error", error: { code: "invalid_input", message: error instanceof Error ? error.message : String(error) } }, null, 2));
  process.exit(1);
}

function parseJson<T>(value: string): T {
  try { return JSON.parse(value) as T; } catch { throw new Error("--input must be valid JSON"); }
}

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function validateHumanIndexOptions(options: {
  human?: boolean;
  curated?: boolean;
  categoryPages?: boolean;
  type?: string;
  maxPerSection?: string;
}): void {
  const humanOnly = options.curated || options.categoryPages || options.type !== undefined || options.maxPerSection !== undefined;
  if (humanOnly && !options.human) {
    throw new Error("--curated, --category-pages, --type and --max-per-section require --human");
  }
  if (options.type !== undefined && !(validWikiDocumentTypes as readonly string[]).includes(options.type)) {
    throw new Error(`Invalid wiki document type: ${options.type}`);
  }
  if (options.maxPerSection !== undefined) {
    if (!/^\d+$/.test(options.maxPerSection)) {
      throw new Error("--max-per-section must be a non-negative safe integer");
    }

    const value = Number(options.maxPerSection);
    if (!Number.isSafeInteger(value)) {
      throw new Error("--max-per-section must be a non-negative safe integer");
    }
  }
}
