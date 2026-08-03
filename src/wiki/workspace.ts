import { readdir, readFile, writeFile } from "node:fs/promises";
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

export type WikiUpdateInput = {
  id: string;
  title?: string;
  type?: string;
  status?: string;
  tags?: string[];
};

export type WikiUpdateResult = {
  id: string;
  title: string;
  type: string;
  status: string;
  tags: string[];
  path: string;
};

export type WikiRelateInput = {
  sourceId: string;
  targetId: string;
  relation: string;
};

export type WikiRelateResult = {
  source: string;
  target: string;
  relation: string;
  path: string;
  created: boolean;
};

export type WikiSearchFilters = WikiListFilters;

export type WikiSearchResult = WikiDocumentSummary & {
  snippet: string;
};

export type WikiRelation = {
  source: string;
  target: string;
  relation: string;
};

export type WikiIndexResult = {
  documentsIndexed: number;
  relationsIndexed: number;
  indexPath: string;
  relationsPath: string;
  warnings: string[];
};

export type WikiLintIssue = {
  path: string;
  message: string;
};

export type WikiLintResult = {
  documentsChecked: number;
  issues: WikiLintIssue[];
};

export type WikiDoctorCheck = {
  name: string;
  status: "pass" | "fail";
  message: string;
};

export type WikiDoctorResult = {
  ok: boolean;
  checks: WikiDoctorCheck[];
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
  return (await findWikiDocumentById(config.resolvedWikiPath, documentId))?.document ?? null;
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

export async function updateWikiDocument(
  config: ResolvedThothConfig,
  input: WikiUpdateInput,
): Promise<WikiUpdateResult> {
  const located = await findWikiDocumentById(config.resolvedWikiPath, input.id);

  if (!located) {
    throw new Error(`Document not found: ${input.id}`);
  }

  const parsed = matter(located.document.raw);
  const metadata = { ...(parsed.data as Record<string, unknown>) };

  if (input.title) {
    metadata.title = input.title;
  }

  if (input.type) {
    metadata.type = input.type;
  }

  if (input.status) {
    metadata.status = input.status;
  }

  if (input.tags && input.tags.length > 0) {
    metadata.tags = mergeTags(readStringArray(metadata.tags), input.tags);
  }

  normalizeDateMetadata(metadata);
  metadata.updated_at = currentDate();

  await writeFile(located.path, matter.stringify(parsed.content, metadata), "utf8");

  const updatedDocument = await readWikiDocument(config.resolvedWikiPath, located.path);

  return {
    id: updatedDocument.id,
    title: updatedDocument.title,
    type: updatedDocument.type,
    status: updatedDocument.status,
    tags: updatedDocument.tags,
    path: updatedDocument.path,
  };
}

export async function relateWikiDocuments(
  config: ResolvedThothConfig,
  input: WikiRelateInput,
): Promise<WikiRelateResult> {
  const source = await findWikiDocumentById(config.resolvedWikiPath, input.sourceId);

  if (!source) {
    throw new Error(`Source document not found: ${input.sourceId}`);
  }

  const target = await findWikiDocumentById(config.resolvedWikiPath, input.targetId);

  if (!target) {
    throw new Error(`Target document not found: ${input.targetId}`);
  }

  const parsed = matter(source.document.raw);
  const metadata = { ...(parsed.data as Record<string, unknown>) };
  const relations = readRelations(metadata.related);
  const exists = relations.some(
    (relation) => relation.id === input.targetId && relation.relation === input.relation,
  );

  if (!exists) {
    metadata.related = [...relations, { id: input.targetId, relation: input.relation }];
    normalizeDateMetadata(metadata);
    metadata.updated_at = currentDate();

    await writeFile(source.path, matter.stringify(parsed.content, metadata), "utf8");
  }

  return {
    source: input.sourceId,
    target: input.targetId,
    relation: input.relation,
    path: source.document.path,
    created: !exists,
  };
}

export async function searchWikiDocuments(
  config: ResolvedThothConfig,
  query: string,
  filters: WikiSearchFilters = {},
): Promise<WikiSearchResult[]> {
  if (!(await pathExists(config.resolvedWikiPath))) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const markdownPaths = await collectMarkdownFiles(config.resolvedWikiPath);
  const results: WikiSearchResult[] = [];

  for (const markdownPath of markdownPaths) {
    const document = await readWikiDocument(config.resolvedWikiPath, markdownPath);

    if (!matchesFilters(document, filters)) {
      continue;
    }

    const searchableText = [
      document.id,
      document.title,
      document.type,
      document.status,
      document.tags.join(" "),
      document.content,
    ].join("\n");

    if (searchableText.toLowerCase().includes(normalizedQuery)) {
      results.push({
        ...document,
        snippet: createSnippet(searchableText, normalizedQuery),
      });
    }
  }

  return results.sort((left, right) => left.path.localeCompare(right.path));
}

export async function rebuildWikiIndex(
  config: ResolvedThothConfig,
): Promise<WikiIndexResult> {
  await ensureDirectory(path.join(config.resolvedWikiPath, ".thoth"));

  const markdownPaths = await collectMarkdownFiles(config.resolvedWikiPath);
  const documents: WikiDocumentSummary[] = [];
  const relations: WikiRelation[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();

  for (const markdownPath of markdownPaths) {
    const document = await readWikiDocument(config.resolvedWikiPath, markdownPath);

    if (seenIds.has(document.id)) {
      warnings.push(`Duplicate document id: ${document.id}`);
    }

    seenIds.add(document.id);
    documents.push(toDocumentSummary(document));

    for (const relation of readRelations(document.metadata.related)) {
      relations.push({
        source: document.id,
        target: relation.id,
        relation: relation.relation,
      });
    }
  }

  for (const relation of relations) {
    if (!seenIds.has(relation.target)) {
      warnings.push(
        `Broken relation: ${relation.source} -> ${relation.target} (${relation.relation})`,
      );
    }
  }

  documents.sort((left, right) => left.path.localeCompare(right.path));
  relations.sort((left, right) =>
    `${left.source}:${left.target}:${left.relation}`.localeCompare(
      `${right.source}:${right.target}:${right.relation}`,
    ),
  );

  const indexPath = path.join(config.resolvedWikiPath, ".thoth", "index.json");
  const relationsPath = path.join(config.resolvedWikiPath, ".thoth", "relations.json");

  await writeFile(
    indexPath,
    `${JSON.stringify({ documents, warnings }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    relationsPath,
    `${JSON.stringify({ relations, warnings }, null, 2)}\n`,
    "utf8",
  );

  return {
    documentsIndexed: documents.length,
    relationsIndexed: relations.length,
    indexPath: path.relative(config.resolvedWikiPath, indexPath),
    relationsPath: path.relative(config.resolvedWikiPath, relationsPath),
    warnings,
  };
}

export async function lintWikiDocuments(
  config: ResolvedThothConfig,
): Promise<WikiLintResult> {
  if (!(await pathExists(config.resolvedWikiPath))) {
    return { documentsChecked: 0, issues: [] };
  }

  const markdownPaths = await collectMarkdownFiles(config.resolvedWikiPath);
  const documents: WikiDocument[] = [];
  const issues: WikiLintIssue[] = [];
  const ids = new Map<string, string[]>();

  for (const markdownPath of markdownPaths) {
    const document = await readWikiDocument(config.resolvedWikiPath, markdownPath);
    documents.push(document);

    for (const field of ["id", "title", "type", "status"]) {
      if (!hasStringMetadata(document.metadata, field)) {
        issues.push({
          path: document.path,
          message: `Missing required frontmatter: ${field}`,
        });
      }
    }

    const paths = ids.get(document.id) ?? [];
    paths.push(document.path);
    ids.set(document.id, paths);
  }

  for (const [id, paths] of ids) {
    if (paths.length <= 1) {
      continue;
    }

    for (const documentPath of paths) {
      issues.push({
        path: documentPath,
        message: `Duplicate document id: ${id}`,
      });
    }
  }

  const knownIds = new Set(ids.keys());

  for (const document of documents) {
    for (const relation of readRelations(document.metadata.related)) {
      if (!knownIds.has(relation.id)) {
        issues.push({
          path: document.path,
          message: `Broken relation: ${document.id} -> ${relation.id} (${relation.relation})`,
        });
      }
    }
  }

  return {
    documentsChecked: documents.length,
    issues: issues.sort((left, right) =>
      `${left.path}:${left.message}`.localeCompare(`${right.path}:${right.message}`),
    ),
  };
}

export async function runWikiDoctor(
  config: ResolvedThothConfig,
): Promise<WikiDoctorResult> {
  const checks: WikiDoctorCheck[] = [];
  const status = await getWikiStatus(config);

  checks.push({
    name: "config",
    status: "pass",
    message: `Loaded ${config.configPath}`,
  });
  checks.push({
    name: "wiki",
    status: status.wikiExists ? "pass" : "fail",
    message: status.wikiExists
      ? `Wiki exists at ${status.wikiPath}`
      : `Wiki not found at ${status.wikiPath}`,
  });
  checks.push({
    name: "structure",
    status: status.missingDirectories.length === 0 ? "pass" : "fail",
    message: status.missingDirectories.length === 0
      ? "Required directories exist"
      : `Missing directories: ${status.missingDirectories.join(", ")}`,
  });

  if (status.wikiExists) {
    const lint = await lintWikiDocuments(config);
    checks.push({
      name: "lint",
      status: lint.issues.length === 0 ? "pass" : "fail",
      message: lint.issues.length === 0
        ? `No issues across ${lint.documentsChecked} documents`
        : `${lint.issues.length} issues across ${lint.documentsChecked} documents`,
    });

    try {
      const index = await rebuildWikiIndex(config);
      checks.push({
        name: "index",
        status: "pass",
        message: `Regenerated ${index.documentsIndexed} documents and ${index.relationsIndexed} relations`,
      });
    } catch (error) {
      checks.push({
        name: "index",
        status: "fail",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    checks.push({
      name: "lint",
      status: "fail",
      message: "Skipped because wiki does not exist",
    });
    checks.push({
      name: "index",
      status: "fail",
      message: "Skipped because wiki does not exist",
    });
  }

  return {
    ok: checks.every((check) => check.status === "pass"),
    checks,
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

async function findWikiDocumentById(
  wikiPath: string,
  documentId: string,
): Promise<{ path: string; document: WikiDocument } | null> {
  if (!(await pathExists(wikiPath))) {
    return null;
  }

  const markdownPaths = await collectMarkdownFiles(wikiPath);

  for (const markdownPath of markdownPaths) {
    const document = await readWikiDocument(wikiPath, markdownPath);

    if (document.id === documentId) {
      return { path: markdownPath, document };
    }
  }

  return null;
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

function toDocumentSummary(document: WikiDocument): WikiDocumentSummary {
  return {
    id: document.id,
    title: document.title,
    type: document.type,
    status: document.status,
    tags: document.tags,
    path: document.path,
  };
}

function readRelations(value: unknown): Array<{ id: string; relation: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const relation = entry as Record<string, unknown>;
    const id = relation.id;
    const relationType = relation.relation;

    if (typeof id !== "string" || typeof relationType !== "string") {
      return [];
    }

    return [{ id, relation: relationType }];
  });
}

function hasStringMetadata(metadata: Record<string, unknown>, field: string): boolean {
  const value = metadata[field];

  return typeof value === "string" && value.length > 0;
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

function mergeTags(existingTags: string[], newTags: string[]): string[] {
  return Array.from(new Set([...existingTags, ...newTags]));
}

function normalizeDateMetadata(metadata: Record<string, unknown>): void {
  for (const field of ["created_at", "updated_at"]) {
    const value = metadata[field];

    if (value instanceof Date) {
      metadata[field] = value.toISOString().slice(0, 10);
    }
  }
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

function createSnippet(text: string, normalizedQuery: string): string {
  const compactText = text.replace(/\s+/g, " ").trim();
  const index = compactText.toLowerCase().indexOf(normalizedQuery);

  if (index === -1) {
    return compactText.slice(0, 120);
  }

  const start = Math.max(0, index - 40);
  const end = Math.min(compactText.length, index + normalizedQuery.length + 80);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < compactText.length ? "..." : "";

  return `${prefix}${compactText.slice(start, end)}${suffix}`;
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
