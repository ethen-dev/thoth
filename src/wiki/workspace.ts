import path from "node:path";
import type { ResolvedThothConfig } from "../core/config.js";
import { ensureDirectory, pathExists, writeFileIfMissing } from "../storage/index.js";

const wikiDirectories = [
  ".thoth",
  "projects",
  "notes",
  "ideas",
  "decisions",
  "research",
  "entities",
  "timelines",
] as const;

export type WikiStatus = {
  workspacePath: string;
  configPath: string;
  wikiPath: string;
  wikiExists: boolean;
  indexExists: boolean;
  missingDirectories: string[];
};

export type WikiInitResult = WikiStatus & {
  createdDirectories: string[];
  index: "created" | "exists";
};

export async function getWikiStatus(
  config: ResolvedThothConfig,
): Promise<WikiStatus> {
  const missingDirectories: string[] = [];

  for (const directory of wikiDirectories) {
    const directoryPath = path.join(config.resolvedWikiPath, directory);

    if (!(await pathExists(directoryPath))) {
      missingDirectories.push(directory);
    }
  }

  return {
    workspacePath: config.workspacePath,
    configPath: config.configPath,
    wikiPath: config.resolvedWikiPath,
    wikiExists: await pathExists(config.resolvedWikiPath),
    indexExists: await pathExists(path.join(config.resolvedWikiPath, "index.md")),
    missingDirectories,
  };
}

export async function initializeWiki(
  config: ResolvedThothConfig,
): Promise<WikiInitResult> {
  const createdDirectories: string[] = [];

  await ensureDirectory(config.resolvedWikiPath);

  for (const directory of wikiDirectories) {
    const directoryPath = path.join(config.resolvedWikiPath, directory);

    if (!(await pathExists(directoryPath))) {
      await ensureDirectory(directoryPath);
      createdDirectories.push(directory);
    }
  }

  const index = await writeFileIfMissing(
    path.join(config.resolvedWikiPath, "index.md"),
    createWikiIndex(),
  );

  const status = await getWikiStatus(config);

  return {
    ...status,
    createdDirectories,
    index,
  };
}

function createWikiIndex(): string {
  return `---
id: wiki-index
title: T.H.O.T.H. Wiki Index
type: reference
status: active
created_at: 2026-08-03
updated_at: 2026-08-03
tags:
  - index
source: generated
related: []
---

# T.H.O.T.H. Wiki Index

## Summary

Indice inicial de la LLM Wiki.
`;
}
