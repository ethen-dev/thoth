#!/usr/bin/env node

import { Command } from "commander";
import {
  appendWikiDocument,
  captureWikiDocument,
  getWikiDocumentById,
  getWikiStatus,
  initializeWiki,
  listWikiDocuments,
  lintWikiDocuments,
  relateWikiDocuments,
  rebuildWikiIndex,
  runWikiDoctor,
  searchWikiDocuments,
  updateWikiDocument,
} from "../actions/index.js";
import { loadConfig } from "../core/index.js";

const thothVersion = "0.3.1";
const program = new Command();

program
  .name("thoth")
  .description("T.H.O.T.H. local operations CLI")
  .version(thothVersion);

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
  .option("--type <type>", "Filter by document type")
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
  .option("--type <type>", "Document type")
  .option("--title <title>", "Document title")
  .option("--status <status>", "Document status")
  .option("--tag <tag>", "Document tag. Can be used multiple times", collectValues, [])
  .action(
    async (
      content: string,
      options: {
        type?: string;
        title?: string;
        status?: string;
        tag?: string[];
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
  .command("search")
  .description("Search wiki documents")
  .argument("<query>", "Search query")
  .option("--type <type>", "Filter by document type")
  .option("--status <status>", "Filter by document status")
  .option("--tag <tag>", "Filter by tag")
  .action(
    async (
      query: string,
      options: { type?: string; status?: string; tag?: string },
    ) => {
      try {
        const config = await loadConfig();
        const results = await searchWikiDocuments(config, query, options);

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
  .description("Rebuild derived wiki indexes")
  .action(async () => {
    try {
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
  .command("update")
  .description("Update wiki document metadata")
  .argument("<id>", "Document id")
  .option("--title <title>", "Document title")
  .option("--type <type>", "Document type")
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
  .requiredOption("--relation <relation>", "Relation type")
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

program.parse();

function reportError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`T.H.O.T.H. cannot proceed: ${message}`);
  process.exit(1);
}

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}
