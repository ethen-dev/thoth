#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "../core/index.js";
import { getWikiStatus, initializeWiki, listWikiDocuments } from "../wiki/index.js";

const program = new Command();

program
  .name("thoth")
  .description("T.H.O.T.H. local operations CLI")
  .version("0.1.0");

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

program.parse();

function reportError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`T.H.O.T.H. cannot proceed: ${message}`);
  process.exit(1);
}
