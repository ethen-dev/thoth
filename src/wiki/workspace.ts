import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { ResolvedThothConfig } from "../core/config.js";
import { ensureDirectory, pathExists, writeFileIfMissing } from "../storage/index.js";

const wikiDirectories = [
  ".thoth",
  "projects",
  "notes",
  "ideas",
  "decisions",
  "implementation",
  "sessions",
  "logs",
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

export type WikiDocumentSummary = {
  id: string;
  title: string;
  type: string;
  status: string;
  tags: string[];
  path: string;
};

export type WikiDocument = WikiDocumentSummary & {
  metadata: Record<string, unknown>;
  content: string;
  raw: string;
};

export type WikiListFilters = {
  type?: string;
  status?: string;
  tag?: string;
};

export type WikiCaptureInput = {
  content: string;
  title?: string;
  type?: string;
  status?: string;
  tags?: string[];
};

export type WikiCaptureResult = {
  id: string;
  title: string;
  type: string;
  status: string;
  path: string;
  created: boolean;
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

export async function listWikiDocuments(
  config: ResolvedThothConfig,
  filters: WikiListFilters = {},
): Promise<WikiDocumentSummary[]> {
  if (!(await pathExists(config.resolvedWikiPath))) {
    return [];
  }

  const markdownPaths = await collectMarkdownFiles(config.resolvedWikiPath);
  const documents: WikiDocumentSummary[] = [];

  for (const markdownPath of markdownPaths) {
    const document = await readWikiDocument(config.resolvedWikiPath, markdownPath);

    if (matchesFilters(document, filters)) {
      documents.push(document);
    }
  }

  return documents.sort((left, right) => left.path.localeCompare(right.path));
}

export async function getWikiDocumentById(
  config: ResolvedThothConfig,
  documentId: string,
): Promise<WikiDocument | null> {
  if (!(await pathExists(config.resolvedWikiPath))) {
    return null;
  }

  const markdownPaths = await collectMarkdownFiles(config.resolvedWikiPath);

  for (const markdownPath of markdownPaths) {
    const document = await readWikiDocument(config.resolvedWikiPath, markdownPath);

    if (document.id === documentId) {
      return document;
    }
  }

  return null;
}

export async function captureWikiDocument(
  config: ResolvedThothConfig,
  input: WikiCaptureInput,
): Promise<WikiCaptureResult> {
  const type = input.type ?? config.defaultType;
  const status = input.status ?? config.defaultStatus;
  const title = input.title ?? createTitle(input.content);
  const id = `${type}-${slugify(title)}`;
  const directory = directoryForType(type);
  const relativePath = path.join(directory, `${id}.md`);
  const filePath = path.join(config.resolvedWikiPath, relativePath);
  const markdown = createWikiDocumentMarkdown({
    id,
    title,
    type,
    status,
    tags: input.tags ?? [],
    content: input.content,
    date: currentDate(),
  });
  const result = await writeFileIfMissing(filePath, markdown);

  return {
    id,
    title,
    type,
    status,
    path: relativePath,
    created: result === "created",
  };
}

async function readWikiDocument(
  wikiPath: string,
  markdownPath: string,
): Promise<WikiDocument> {
  const raw = await readFile(markdownPath, "utf8");
  const parsed = matter(raw);
  const metadata = parsed.data as Record<string, unknown>;
  const relativePath = path.relative(wikiPath, markdownPath);

  return {
    id: readString(metadata.id, relativePath),
    title: readString(metadata.title, path.basename(markdownPath, ".md")),
    type: readString(metadata.type, "unknown"),
    status: readString(metadata.status, "unknown"),
    tags: readStringArray(metadata.tags),
    path: relativePath,
    metadata,
    content: parsed.content.trimStart(),
    raw,
  };
}

async function collectMarkdownFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === ".thoth") {
      continue;
    }

    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

function matchesFilters(
  document: WikiDocumentSummary,
  filters: WikiListFilters,
): boolean {
  if (filters.type && document.type !== filters.type) {
    return false;
  }

  if (filters.status && document.status !== filters.status) {
    return false;
  }

  if (filters.tag && !document.tags.includes(filters.tag)) {
    return false;
  }

  return true;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function createWikiDocumentMarkdown(input: {
  id: string;
  title: string;
  type: string;
  status: string;
  tags: string[];
  content: string;
  date: string;
}): string {
  const tags = input.tags.length > 0
    ? `\n${input.tags.map((tag) => `  - ${yamlString(tag)}`).join("\n")}`
    : " []";

  return `---
id: ${yamlString(input.id)}
title: ${yamlString(input.title)}
type: ${yamlString(input.type)}
status: ${yamlString(input.status)}
created_at: ${input.date}
updated_at: ${input.date}
tags:${tags}
source: "manual"
related: []
---

# ${input.title}

## Summary

${input.content}

## Content

${input.content}
`;
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function createTitle(content: string): string {
  const firstLine = content.trim().split("\n")[0]?.trim();

  if (!firstLine) {
    return "Untitled";
  }

  return firstLine.length > 60 ? firstLine.slice(0, 60).trim() : firstLine;
}

function directoryForType(type: string): string {
  const directories: Record<string, string> = {
    decision: "decisions",
    entity: "entities",
    idea: "ideas",
    implementation: "implementation",
    log: "logs",
    note: "notes",
    project: "projects",
    research: "research",
    session: "sessions",
    timeline: "timelines",
  };

  return directories[type] ?? "notes";
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "untitled";
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
