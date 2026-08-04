import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema, ErrorObject, ValidateFunction } from "ajv";
import matter from "gray-matter";
import type { ResolvedThothConfig } from "../core/config.js";
import {
  appendTextToFile,
  ensureDirectory,
  pathExists,
  writeFileIfMissing,
} from "../storage/index.js";

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
  "sources",
  "entities",
  "timelines",
] as const;

const humanIndexSections = [
  { heading: "Projects", type: "project" },
  { heading: "Tasks", type: "task" },
  { heading: "Decisions", type: "decision" },
  { heading: "Implementation", type: "implementation" },
  { heading: "Logs", type: "log" },
  { heading: "Notes", type: "note" },
  { heading: "Ideas", type: "idea" },
  { heading: "Research", type: "research" },
  { heading: "Sources", type: "source" },
  { heading: "Entities", type: "entity" },
  { heading: "Sessions", type: "session" },
  { heading: "Timelines", type: "timeline" },
] as const;

export const validWikiDocumentTypes = [
  "project",
  "note",
  "idea",
  "decision",
  "implementation",
  "session",
  "log",
  "research",
  "source",
  "entity",
  "character",
  "chapter",
  "timeline",
  "reference",
  "task",
] as const;

export const validWikiCaptureDocumentTypes = [
  "project",
  "note",
  "idea",
  "decision",
  "implementation",
  "session",
  "log",
  "research",
  "entity",
  "character",
  "chapter",
  "timeline",
  "reference",
  "task",
] as const;

export const validWikiRelationTypes = [
  "belongs_to",
  "mentions",
  "depends_on",
  "continues",
  "contradicts",
  "supports",
  "references",
  "related_to",
  "has_note",
  "has_decision",
  "has_implementation",
  "derived_from",
  "source_for",
  "supersedes",
  "applies_to",
  "updates",
  "complements",
  "refines",
  "extends",
  "follows",
  "implements",
  "fixes",
  "parallels",
  "verifies",
  "documents",
  "has_log",
  "has_subarea",
  "has_verification",
] as const;

export const validLogKinds = [
  "implementation",
  "decision",
  "discovery",
  "structure",
  "fix",
  "environment",
  "correction",
  "verification",
  "maintenance",
  "version",
  "log",
] as const;

const validWikiDocumentTypeSet = new Set<string>(validWikiDocumentTypes);
const validWikiCaptureDocumentTypeSet = new Set<string>(validWikiCaptureDocumentTypes);
const validWikiRelationTypeSet = new Set<string>(validWikiRelationTypes);
const validLogKindSet = new Set<string>(validLogKinds);

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
  log: "created" | "exists";
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
  id?: string;
  title?: string;
  type?: string;
  status?: string;
  tags?: string[];
  projectId?: string;
};

export type WikiCaptureResult = {
  id: string;
  title: string;
  type: string;
  status: string;
  path: string;
  created: boolean;
};

export type WikiSourceAddInput = {
  content: string;
  title: string;
  id?: string;
  status?: string;
  tags?: string[];
};

export type WikiSourceLinkResult = {
  source: string;
  target: string;
  sourceRelation: WikiRelateResult;
  targetRelation: WikiRelateResult;
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

export type WikiAppendInput = {
  id: string;
  content: string;
  section?: string;
};

export type WikiAppendResult = {
  id: string;
  path: string;
  section: string;
};

export type WikiLogInput = {
  content: string;
  kind?: string;
  projectId?: string;
  ref?: string;
};

export type WikiLogResult = {
  globalPath: string;
  timelinePath?: string;
  entry: string;
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

export type WikiHumanIndexResult = {
  documentsIndexed: number;
  relationsIndexed: number;
  indexPath: string;
};

export type WikiSyncLinksResult = {
  documentsChecked: number;
  documentsUpdated: number;
  linksCreated: number;
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

  const log = await writeFileIfMissing(
    path.join(config.resolvedWikiPath, "log.md"),
    createWikiLog(),
  );

  const status = await getWikiStatus(config);

  return {
    ...status,
    createdDirectories,
    index,
    log,
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
  const id = input.id ?? `${type}-${slugify(title)}`;

  assertValidDocumentType(type);
  assertValidCaptureDocumentType(type);

  let projectSlug: string | undefined;
  if (type === "task") {
    if (!input.projectId) {
      throw new Error("Task documents require a projectId");
    }
    projectSlug = await getProjectSlug(config, input.projectId);
  }

  if (input.id) {
    validateDocumentId(type, id);
  }

  const directory = projectSlug
    ? path.join("projects", projectSlug, "tasks")
    : directoryForType(type);
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
    related: projectSlug ? [{ id: input.projectId as string, relation: "belongs_to" }] : [],
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

export async function addWikiSourceDocument(
  config: ResolvedThothConfig,
  input: WikiSourceAddInput,
): Promise<WikiCaptureResult> {
  const title = input.title.trim();

  if (!title) {
    throw new Error("Source title is required");
  }

  const type = "source";
  const status = input.status ?? config.defaultStatus;
  const id = input.id ?? `${type}-${slugify(title)}`;

  validateDocumentId(type, id);

  const directory = directoryForType(type);
  const relativePath = path.join(directory, `${id}.md`);
  const filePath = path.join(config.resolvedWikiPath, relativePath);
  const markdown = createWikiSourceMarkdown({
    id,
    title,
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
    assertValidDocumentType(input.type);
    assertValidSourceTypeTransition(located.document.type, input.type);
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

  await assertValidUpdatedDocumentRelations(config.resolvedWikiPath, input.id, metadata);

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

export async function appendWikiDocument(
  config: ResolvedThothConfig,
  input: WikiAppendInput,
): Promise<WikiAppendResult> {
  const located = await findWikiDocumentById(config.resolvedWikiPath, input.id);

  if (!located) {
    throw new Error(`Document not found: ${input.id}`);
  }

  const parsed = matter(located.document.raw);
  const metadata = { ...(parsed.data as Record<string, unknown>) };
  const section = input.section ?? "Notes";
  const content = appendToSection(parsed.content, section, input.content);

  normalizeDateMetadata(metadata);
  metadata.updated_at = currentDate();

  await writeFile(located.path, matter.stringify(content, metadata), "utf8");

  return {
    id: input.id,
    path: located.document.path,
    section,
  };
}

export async function appendLogEntry(
  config: ResolvedThothConfig,
  input: WikiLogInput,
): Promise<WikiLogResult> {
  const content = input.content.trim();

  if (!content) {
    throw new Error("Log content is required");
  }

  const kind = input.kind ?? "log";
  assertValidLogKind(kind);

  let projectId: string | undefined;

  if (input.projectId) {
    await assertProjectExists(config, input.projectId);
    projectId = input.projectId;
  }

  const entry = createLogEntryMarkdown({ content, kind, ref: input.ref });

  const globalPath = path.join(config.resolvedWikiPath, "log.md");
  await writeFileIfMissing(globalPath, createWikiLog());
  await appendTextToFile(globalPath, entry);

  let timelinePath: string | undefined;

  if (projectId) {
    const timelineRelativePath = path.join(
      directoryForType("timeline"),
      `timeline-${projectId}.md`,
    );
    const timelineFilePath = path.join(config.resolvedWikiPath, timelineRelativePath);

    await writeFileIfMissing(
      timelineFilePath,
      createTimelineMarkdown({
        id: `timeline-${projectId}`,
        title: `Timeline ${projectId}`,
        projectId,
        date: currentDate(),
      }),
    );
    await appendTextToFile(timelineFilePath, entry);
    timelinePath = timelineRelativePath;
  }

  return {
    globalPath: path.relative(config.resolvedWikiPath, globalPath),
    timelinePath,
    entry,
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
  assertValidRelationType(input.relation);
  assertValidSourceRelation(input.relation, source.document, target.document);
  const relations = readRelations(metadata.related);
  const exists = relations.some(
    (relation) => relation.id === input.targetId && relation.relation === input.relation,
  );

  if (!exists) {
    metadata.related = [...relations, { id: input.targetId, relation: input.relation }];
    normalizeDateMetadata(metadata);
    metadata.updated_at = currentDate();
    const content = appendMarkdownRelation(parsed.content, {
      relation: input.relation,
      targetTitle: target.document.title,
      targetPath: path.relative(path.dirname(source.path), target.path),
    });

    await writeFile(source.path, matter.stringify(content, metadata), "utf8");
  }

  return {
    source: input.sourceId,
    target: input.targetId,
    relation: input.relation,
    path: source.document.path,
    created: !exists,
  };
}

export async function linkWikiSourceDocument(
  config: ResolvedThothConfig,
  sourceId: string,
  targetId: string,
): Promise<WikiSourceLinkResult> {
  const source = await findWikiDocumentById(config.resolvedWikiPath, sourceId);

  if (!source) {
    throw new Error(`Source document not found: ${sourceId}`);
  }

  if (source.document.type !== "source") {
    throw new Error(`Source document must have type source: ${sourceId}`);
  }

  const target = await findWikiDocumentById(config.resolvedWikiPath, targetId);

  if (!target) {
    throw new Error(`Target document not found: ${targetId}`);
  }

  const sourceRelation = await relateWikiDocuments(config, {
    sourceId,
    targetId,
    relation: "source_for",
  });
  const targetRelation = await relateWikiDocuments(config, {
    sourceId: targetId,
    targetId: sourceId,
    relation: "derived_from",
  });

  return {
    source: sourceId,
    target: targetId,
    sourceRelation,
    targetRelation,
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

export async function rebuildHumanWikiIndex(
  config: ResolvedThothConfig,
): Promise<WikiHumanIndexResult> {
  await ensureDirectory(config.resolvedWikiPath);

  const markdownPaths = await collectMarkdownFiles(config.resolvedWikiPath);
  const documents = (await Promise.all(
    markdownPaths.map((markdownPath) => readWikiDocument(config.resolvedWikiPath, markdownPath)),
  ))
    .filter((document) => !document.id.startsWith("wiki-"))
    .sort((left, right) => {
      const typeOrder = humanIndexSections.findIndex((section) => section.type === left.type)
        - humanIndexSections.findIndex((section) => section.type === right.type);

      if (typeOrder !== 0) {
        return typeOrder;
      }

      return left.title.localeCompare(right.title);
    });

  const indexPath = path.join(config.resolvedWikiPath, "index.md");

  await writeFile(indexPath, createHumanWikiIndex(documents), "utf8");

  return {
    documentsIndexed: documents.length,
    relationsIndexed: documents.flatMap((document) => readRelations(document.metadata.related)).length,
    indexPath: path.relative(config.resolvedWikiPath, indexPath),
  };
}

export async function syncWikiRelationLinks(
  config: ResolvedThothConfig,
): Promise<WikiSyncLinksResult> {
  if (!(await pathExists(config.resolvedWikiPath))) {
    return { documentsChecked: 0, documentsUpdated: 0, linksCreated: 0 };
  }

  const markdownPaths = await collectMarkdownFiles(config.resolvedWikiPath);
  const documents = await Promise.all(
    markdownPaths.map((markdownPath) => readWikiDocument(config.resolvedWikiPath, markdownPath)),
  );
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  let documentsUpdated = 0;
  let linksCreated = 0;

  for (const document of documents) {
    const relations = readRelations(document.metadata.related);

    if (relations.length === 0) {
      continue;
    }

    const parsed = matter(document.raw);
    const metadata = { ...(parsed.data as Record<string, unknown>) };
    let content = parsed.content;
    let documentLinksCreated = 0;

    for (const relation of relations) {
      const target = documentsById.get(relation.id);

      if (!target) {
        continue;
      }

      const nextContent = appendMarkdownRelation(content, {
        relation: relation.relation,
        targetTitle: target.title,
        targetPath: path.relative(path.dirname(path.join(config.resolvedWikiPath, document.path)), path.join(config.resolvedWikiPath, target.path)),
      });

      if (nextContent !== content) {
        content = nextContent;
        documentLinksCreated += 1;
      }
    }

    if (documentLinksCreated > 0) {
      normalizeDateMetadata(metadata);
      metadata.updated_at = currentDate();
      await writeFile(
        path.join(config.resolvedWikiPath, document.path),
        matter.stringify(content, metadata),
        "utf8",
      );
      documentsUpdated += 1;
      linksCreated += documentLinksCreated;
    }
  }

  return {
    documentsChecked: documents.length,
    documentsUpdated,
    linksCreated,
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
  const schemas = await loadWikiSchemas(config.workspacePath);

  for (const markdownPath of markdownPaths) {
    const document = await readWikiDocument(config.resolvedWikiPath, markdownPath);
    documents.push(document);

    const valid = schemas.document(normalizeSchemaValue(document.metadata));

    if (!valid) {
      issues.push(...schemaIssues(document.path, schemas.document.errors));
    }

    for (const field of ["id", "title", "type", "status"]) {
      if (!hasStringMetadata(document.metadata, field)) {
        issues.push({
          path: document.path,
          message: `Missing required frontmatter: ${field}`,
        });
      }
    }

    if (hasStringMetadata(document.metadata, "type") && !validWikiDocumentTypeSet.has(document.type)) {
      issues.push({
        path: document.path,
        message: `Invalid document type: ${document.type}`,
      });
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
      if (!validWikiRelationTypeSet.has(relation.relation)) {
        issues.push({
          path: document.path,
          message: `Invalid relation type: ${relation.relation}`,
        });
      }

      if (!knownIds.has(relation.id)) {
        issues.push({
          path: document.path,
          message: `Broken relation: ${document.id} -> ${relation.id} (${relation.relation})`,
        });
        continue;
      }

      const target = documents.find((candidate) => candidate.id === relation.id);

      if (target) {
        issues.push(...validateSourceRelationIssues(document, relation, target));
      }
    }
  }

  issues.push(...(await lintDerivedIndexFile(
    config.resolvedWikiPath,
    path.join(".thoth", "index.json"),
    schemas.index,
  )));
  issues.push(...(await lintDerivedIndexFile(
    config.resolvedWikiPath,
    path.join(".thoth", "relations.json"),
    schemas.relationsIndex,
  )));

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

type WikiSchemaValidators = {
  document: ValidateFunction;
  index: ValidateFunction;
  relationsIndex: ValidateFunction;
};

async function loadWikiSchemas(workspacePath: string): Promise<WikiSchemaValidators> {
  const ajv = new Ajv2020({ allErrors: true });
  const schemasPath = await resolveSchemasPath(workspacePath);
  const relationSchema = await readJsonFile(path.join(schemasPath, "wiki-relation.schema.json")) as AnySchema;
  const documentSchema = await readJsonFile(path.join(schemasPath, "wiki-document.schema.json")) as AnySchema;
  const indexSchema = await readJsonFile(path.join(schemasPath, "wiki-index.schema.json")) as AnySchema;
  const relationsIndexSchema = await readJsonFile(
    path.join(schemasPath, "wiki-relations-index.schema.json"),
  ) as AnySchema;

  ajv.addSchema(relationSchema, "wiki-relation.schema.json");

  return {
    document: ajv.compile(documentSchema),
    index: ajv.compile(indexSchema),
    relationsIndex: ajv.compile(relationsIndexSchema),
  };
}

async function lintDerivedIndexFile(
  wikiPath: string,
  relativePath: string,
  validate: ValidateFunction,
): Promise<WikiLintIssue[]> {
  const filePath = path.join(wikiPath, relativePath);

  if (!(await pathExists(filePath))) {
    return [];
  }

  try {
    const value = await readJsonFile(filePath);
    const valid = validate(value);

    return valid ? [] : schemaIssues(relativePath, validate.errors);
  } catch (error) {
    return [{
      path: relativePath,
      message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }];
  }
}

async function resolveSchemasPath(workspacePath: string): Promise<string> {
  const candidates = [
    path.join(workspacePath, "schemas"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../schemas"),
    path.join(process.cwd(), "schemas"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? "schemas";
}

async function readJsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function schemaIssues(pathName: string, errors: ErrorObject[] | null | undefined): WikiLintIssue[] {
  return (errors ?? []).map((error) => ({
    path: pathName,
    message: `Schema violation${error.instancePath}: ${error.message ?? "invalid value"}`,
  }));
}

function normalizeSchemaValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (Array.isArray(value)) {
    return value.map(normalizeSchemaValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeSchemaValue(entry)]),
    );
  }

  return value;
}

function appendToSection(content: string, section: string, addition: string): string {
  const normalizedAddition = addition.trim();
  const escapedSection = escapeRegExp(section);
  const heading = new RegExp(`(^|\\n)## ${escapedSection}\\s*\\n`, "m");
  const match = heading.exec(content);

  if (!match || match.index === undefined) {
    return `${content.trimEnd()}\n\n## ${section}\n\n${normalizedAddition}\n`;
  }

  const sectionStart = match.index + match[0].length;
  const nextHeading = content.slice(sectionStart).search(/\n## /);
  const insertAt = nextHeading === -1
    ? content.length
    : sectionStart + nextHeading;

  return `${content.slice(0, insertAt).trimEnd()}\n\n${normalizedAddition}\n${content.slice(insertAt)}`;
}

function appendMarkdownRelation(
  content: string,
  input: { relation: string; targetTitle: string; targetPath: string },
): string {
  const targetPath = toPosixPath(input.targetPath);
  const relationLine = `- ${input.relation}: [${input.targetTitle}](${targetPath})`;

  if (content.includes(relationLine)) {
    return content;
  }

  return appendToSection(content, "Relations", relationLine);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  related: Array<{ id: string; relation: string }>;
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
related:${input.related.length === 0 ? " []" : `\n${input.related.map((relation) => `  - id: ${yamlString(relation.id)}\n    relation: ${yamlString(relation.relation)}`).join("\n")}`}
---

# ${input.title}

## Summary

${input.content}

## Content

${input.content}
`;
}

function createWikiSourceMarkdown(input: {
  id: string;
  title: string;
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
type: "source"
status: ${yamlString(input.status)}
created_at: ${input.date}
updated_at: ${input.date}
tags:${tags}
source: "raw"
related: []
---

# ${input.title}

## Raw Source

${input.content}
`;
}

function createWikiLog(): string {
  const now = currentDate();

  return `---
id: wiki-log
title: T.H.O.T.H. Global Log
type: reference
status: active
created_at: ${now}
updated_at: ${now}
source: generated
related: []
---

# T.H.O.T.H. Global Log
`;
}

function createLogEntryMarkdown(input: {
  content: string;
  kind: string;
  ref?: string;
}): string {
  const date = currentDate();
  const lines = input.content
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const firstLine = lines[0] ?? "";
  const body = lines.map((line) => `- ${line}`).join("\n");
  const reference = input.ref ? `\n- Reference: [[${input.ref}]]` : "";

  return `## [${date}] ${input.kind} | ${firstLine}\n\n${body}${reference}`;
}

function createTimelineMarkdown(input: {
  id: string;
  title: string;
  projectId: string;
  date: string;
}): string {
  return `---
id: ${yamlString(input.id)}
title: ${yamlString(input.title)}
type: timeline
status: active
created_at: ${input.date}
updated_at: ${input.date}
source: manual
related:
  - id: ${yamlString(input.projectId)}
    relation: belongs_to
---

# ${input.title}
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
    source: "sources",
    timeline: "timelines",
    task: "tasks",
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

function validateDocumentId(type: string, id: string): void {
  const expectedPrefix = `${type}-`;

  if (!id.startsWith(expectedPrefix) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`Document id must match ${expectedPrefix}<slug>: ${id}`);
  }
}

function assertValidDocumentType(type: string): void {
  if (!validWikiDocumentTypeSet.has(type)) {
    throw new Error(`Invalid document type: ${type}`);
  }
}

function assertValidCaptureDocumentType(type: string): void {
  if (!validWikiCaptureDocumentTypeSet.has(type)) {
    throw new Error("Use source add to create source documents; capture cannot create type source");
  }
}

function assertValidRelationType(relation: string): void {
  if (!validWikiRelationTypeSet.has(relation)) {
    throw new Error(`Invalid relation type: ${relation}`);
  }
}

function assertValidLogKind(kind: string): void {
  if (!validLogKindSet.has(kind)) {
    throw new Error(`Invalid log kind: ${kind}`);
  }
}

async function assertProjectExists(
  config: ResolvedThothConfig,
  projectId: string,
): Promise<{ path: string; document: WikiDocument }> {
  const located = await findWikiDocumentById(config.resolvedWikiPath, projectId);

  if (!located || located.document.type !== "project") {
    throw new Error(`Project document not found: ${projectId} (expected type project)`);
  }

  return located;
}

async function getProjectSlug(
  config: ResolvedThothConfig,
  projectId: string,
): Promise<string> {
  const located = await assertProjectExists(config, projectId);
  const relativePath = path.relative(config.resolvedWikiPath, located.path);
  const parts = relativePath.split(path.sep);
  const fileName = parts.at(-1) ?? "";

  if (
    parts[0] !== "projects"
    || parts.some((part) => part === ".." || part === ".")
    || !fileName.startsWith("project-")
    || !fileName.endsWith(".md")
  ) {
    throw new Error(`Project document must be located under projects/: ${projectId}`);
  }

  let slug: string | undefined;
  if (parts.length === 3) {
    slug = parts[1];
  } else if (parts.length === 2) {
    slug = fileName.slice("project-".length, -".md".length);
  }

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Project document has an unsafe project slug: ${projectId}`);
  }

  const projectsPath = path.resolve(config.resolvedWikiPath, "projects");
  const taskDirectory = path.resolve(projectsPath, slug, "tasks");
  if (taskDirectory !== projectsPath && !taskDirectory.startsWith(`${projectsPath}${path.sep}`)) {
    throw new Error(`Project document has an unsafe project path: ${projectId}`);
  }

  await rejectSymlinkComponents(projectsPath, located.path, projectId);
  await rejectSymlinkComponents(projectsPath, taskDirectory, projectId);

  return slug;
}

async function rejectSymlinkComponents(
  rootPath: string,
  targetPath: string,
  projectId: string,
): Promise<void> {
  const relativeTarget = path.relative(rootPath, targetPath);
  const components = relativeTarget ? relativeTarget.split(path.sep) : [];
  let currentPath = rootPath;

  for (const component of [rootPath, ...components]) {
    currentPath = component === rootPath ? rootPath : path.join(currentPath, component);

    try {
      if ((await lstat(currentPath)).isSymbolicLink()) {
        throw new Error(`Project path contains a symlink: ${projectId}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        break;
      }

      throw error;
    }
  }
}

function assertValidSourceRelation(
  relation: string,
  source: WikiDocumentSummary,
  target: WikiDocumentSummary,
): void {
  if (relation === "source_for" && source.type !== "source") {
    throw new Error("Relation source_for must originate from a source document");
  }

}

function assertValidSourceTypeTransition(currentType: string, nextType: string): void {
  if (currentType === nextType) {
    return;
  }

  if (nextType === "source") {
    throw new Error("Use source add to create source documents; update cannot change a document to type source");
  }

  if (currentType === "source") {
    throw new Error("Update cannot change a source document to another type");
  }
}

async function assertValidUpdatedDocumentRelations(
  wikiPath: string,
  documentId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const updatedType = readString(metadata.type, "unknown");
  const outgoingRelations = readRelations(metadata.related);

  for (const relation of outgoingRelations) {
    assertValidRelationType(relation.relation);

    if (relation.relation === "source_for" && updatedType !== "source") {
      throw new Error("Relation source_for must originate from a source document");
    }

  }
}

function validateSourceRelationIssues(
  source: WikiDocument,
  relation: { id: string; relation: string },
  target: WikiDocument,
): WikiLintIssue[] {
  const issues: WikiLintIssue[] = [];

  if (relation.relation === "source_for" && source.type !== "source") {
    issues.push({
      path: source.path,
      message: "Invalid source relation: source_for must originate from a source document",
    });
  }

  return issues;
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

function createHumanWikiIndex(documents: WikiDocument[]): string {
  const now = currentDate();
  const sections = humanIndexSections
    .map((section) => {
      const items = documents.filter((document) => document.type === section.type);

      if (items.length === 0) {
        return `## ${section.heading}\n`;
      }

      return `## ${section.heading}\n\n${items
        .map((document) => `- [${document.title}](${toPosixPath(document.path)})`)
        .join("\n")}`;
    })
    .join("\n\n");

  const knownTypes = new Set<string>(humanIndexSections.map((section) => section.type));
  const otherDocuments = documents.filter((document) => !knownTypes.has(document.type));
  const otherSection = otherDocuments.length === 0
    ? "## Other\n"
    : `## Other\n\n${otherDocuments
      .map((document) => `- [${document.title}](${toPosixPath(document.path)})`)
      .join("\n")}`;
  const relationSection = createHumanRelationSection(documents);

  return `---
id: wiki-index
title: T.H.O.T.H. Wiki Index
type: reference
status: active
created_at: ${now}
updated_at: ${now}
tags:
  - index
  - thoth
source: generated
related: []
---

# T.H.O.T.H. Wiki Index

## Summary

Indice humano generado de la LLM Wiki.

${sections}

${otherSection}

${relationSection}

## Notes

Este indice se regenera con \`thoth index --human\` e incluye enlaces por tipo y mapa de relaciones declarado en frontmatter.
`;
}

function createHumanRelationSection(documents: WikiDocument[]): string {
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const relationLines = documents.flatMap((document) =>
    readRelations(document.metadata.related).map((relation) => {
      const target = documentsById.get(relation.id);
      const targetLabel = target
        ? `[${target.title}](${toPosixPath(target.path)})`
        : `\`${relation.id}\``;

      return `- [${document.title}](${toPosixPath(document.path)}) --${relation.relation}--> ${targetLabel}`;
    }),
  );

  if (relationLines.length === 0) {
    return "## Relation Map\n\nNo explicit relations declared yet.";
  }

  return `## Relation Map\n\n${relationLines.join("\n")}`;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
