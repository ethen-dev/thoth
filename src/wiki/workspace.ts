import { lstat, readdir, readFile, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema, ErrorObject, ValidateFunction } from "ajv";
import matter from "gray-matter";
import type { ResolvedThothConfig } from "../core/config.js";
import {
  atomicWriteBatch,
  atomicWriteFile,
  ensureDirectory,
  pathExists,
  withWorkspaceLock,
  writeFileIfMissing,
} from "../storage/index.js";
import type { AtomicWriteBatchEntry } from "../storage/index.js";
import { auditPath, verifyAudit } from "../audit/index.js";
import { thothVersion } from "../version.js";

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

/** The portable wiki status catalog. Existing values remain valid for compatibility. */
export const validWikiStatuses = [
  "draft", "active", "review", "accepted", "captured", "completed", "archived",
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
const validWikiStatusSet = new Set<string>(validWikiStatuses);
const validLogKindSet = new Set<string>(validLogKinds);

export type WikiStatus = {
  workspacePath: string;
  configPath: string;
  wikiPath: string;
  wikiExists: boolean;
  indexExists: boolean;
  missingDirectories: string[];
  available: boolean;
  version: string;
  indexMd: { exists: boolean; valid: boolean };
  technicalIndex: { exists: boolean; valid: boolean; documents: number };
  relationsIndex: { exists: boolean; valid: boolean; relations: number };
  documentCount: number;
  relationCount: number;
  audit: { enabled: boolean; exists: boolean; valid: boolean; entries: number };
};

export type WikiInitResult = WikiStatus & {
  createdDirectories: string[];
  index: "created" | "exists";
  log: "created" | "exists";
  dryRun?: boolean;
  plannedDirectories?: string[];
  plannedFiles?: string[];
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
  updated: boolean;
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
  /** Explicitly include derived Markdown-link synchronization in this plan. */
  syncLinks?: boolean;
};

export type WikiRelateResult = {
  source: string;
  target: string;
  relation: string;
  path: string;
  created: boolean;
};

export type WikiSearchFilters = WikiListFilters & {
  limit?: number;
};

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
  dryRun?: boolean;
  human?: WikiHumanIndexResult;
};

export type WikiIndexOptions = WikiHumanIndexOptions & { human?: boolean; dryRun?: boolean };

export type WikiHumanIndexResult = {
  documentsIndexed: number;
  relationsIndexed: number;
  indexPath: string;
  categoryPages?: string[];
};

export type WikiHumanIndexOptions = {
  curated?: boolean;
  categoryPages?: boolean;
  type?: string;
  maxPerSection?: number;
};

export type WikiSyncLinksResult = {
  documentsChecked: number;
  documentsUpdated: number;
  linksCreated: number;
  dryRun?: boolean;
};

export type WikiLintIssue = {
  path: string;
  message: string;
};

export type WikiLintResult = {
  documentsChecked: number;
  issues: WikiLintIssue[];
};

export type WikiContentBlock = {
  heading: string;
  content: string;
};

/** Normalize only for exact block comparisons; this is deliberately not fuzzy. */
export function normalizeWikiBlock(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function findDuplicateWikiBlocks(content: string): Array<[WikiContentBlock, WikiContentBlock]> {
  const blocks = extractWikiContentBlocks(content);
  const summaries = blocks.filter((block) => block.heading.toLowerCase() === "summary");
  const contents = blocks.filter((block) => block.heading.toLowerCase() === "content");
  const duplicates: Array<[WikiContentBlock, WikiContentBlock]> = [];

  for (const left of summaries) {
    if (!normalizeWikiBlock(left.content)) continue;
    for (const right of contents) {
      if (normalizeWikiBlock(left.content) === normalizeWikiBlock(right.content)) {
        duplicates.push([left, right]);
      }
    }
  }

  return duplicates;
}

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

  const wikiExists = await pathExists(config.resolvedWikiPath);
  const indexMdRaw = await inspectStatusFile(config.workspacePath, config.resolvedWikiPath, "index.md", "markdown");
  const technicalIndexRaw = await inspectStatusFile(config.workspacePath, config.resolvedWikiPath, path.join(".thoth", "index.json"), "index");
  const relationsIndexRaw = await inspectStatusFile(config.workspacePath, config.resolvedWikiPath, path.join(".thoth", "relations.json"), "relations");
  const indexMd = { exists: indexMdRaw.exists, valid: indexMdRaw.valid };
  const technicalIndex = { exists: technicalIndexRaw.exists, valid: technicalIndexRaw.valid, documents: technicalIndexRaw.documents };
  const relationsIndex = { exists: relationsIndexRaw.exists, valid: relationsIndexRaw.valid, relations: relationsIndexRaw.relations };
  const auditEnabled = config.audit?.enabled !== false;
  let audit = { enabled: auditEnabled, exists: false, valid: !auditEnabled, entries: 0 };
  if (auditEnabled) {
    try {
      const verification = await verifyAudit(config);
      audit = { enabled: true, exists: await pathExists(auditPath(config)), valid: verification.valid, entries: verification.entries };
    } catch {
      audit = { enabled: true, exists: false, valid: false, entries: 0 };
    }
  }
  const available = wikiExists && missingDirectories.length === 0 && indexMd.valid && technicalIndex.valid && relationsIndex.valid && audit.valid;
  return {
    workspacePath: config.workspacePath,
    configPath: config.configPath,
    wikiPath: config.resolvedWikiPath,
    wikiExists,
    indexExists: indexMd.exists,
    missingDirectories,
    available,
    version: thothVersion,
    indexMd,
    technicalIndex,
    relationsIndex,
    documentCount: technicalIndex.documents,
    relationCount: relationsIndex.relations,
    audit,
  };
}

async function inspectStatusFile(workspacePath: string, wikiPath: string, relativePath: string, kind: "markdown" | "index" | "relations"): Promise<{ exists: boolean; valid: boolean; documents: number; relations: number }> {
  const filePath = path.join(wikiPath, relativePath);
  const exists = await pathExists(filePath);
  try {
    const raw = await readFile(filePath, "utf8");
    if (!raw.trim()) throw new Error("empty");
    if (kind === "markdown") { matter(raw); return { exists: true, valid: true, documents: 0, relations: 0 }; }
    const schemas = await loadWikiSchemas(workspacePath);
    const value = JSON.parse(raw) as { documents?: unknown[]; relations?: unknown[] };
    const valid = (kind === "index" ? schemas.index : schemas.relationsIndex)(value);
    return { exists: true, valid, documents: kind === "index" && Array.isArray(value.documents) ? value.documents.length : 0, relations: kind === "relations" && Array.isArray(value.relations) ? value.relations.length : 0 };
  } catch {
    return { exists, valid: false, documents: 0, relations: 0 };
  }
}

async function initializeWikiUnsafe(
  config: ResolvedThothConfig,
  options: { beforeFileWrite?: (fileName: "index.md" | "log.md") => Promise<void> } = {},
): Promise<WikiInitResult> {
  const createdDirectories: string[] = [];

  const rootExisted = await pathExists(config.resolvedWikiPath);
  const createdFiles: string[] = [];
  try {
    await ensureDirectory(config.resolvedWikiPath);
    for (const directory of wikiDirectories) {
      const directoryPath = path.join(config.resolvedWikiPath, directory);
      if (!(await pathExists(directoryPath))) {
        await ensureDirectory(directoryPath);
        createdDirectories.push(directoryPath);
      }
    }

    const indexPath = path.join(config.resolvedWikiPath, "index.md");
    await options.beforeFileWrite?.("index.md");
    const index = await writeFileIfMissing(indexPath, createWikiIndex(config.dateFormat), { workspaceRoot: config.resolvedWikiPath });
    if (index === "created") createdFiles.push(indexPath);
    const logPath = path.join(config.resolvedWikiPath, "log.md");
    await options.beforeFileWrite?.("log.md");
    const log = await writeFileIfMissing(logPath, createWikiLog(config.dateFormat), { workspaceRoot: config.resolvedWikiPath });
    if (log === "created") createdFiles.push(logPath);

    return { ...await getWikiStatus(config), createdDirectories: createdDirectories.map((entry) => path.relative(config.resolvedWikiPath, entry)), index, log };
  } catch (error) {
    for (const filePath of createdFiles.reverse()) await unlink(filePath).catch(() => undefined);
    for (const directoryPath of createdDirectories.reverse()) await rmdir(directoryPath).catch(() => undefined);
    if (!rootExisted) await rmdir(config.resolvedWikiPath).catch(() => undefined);
    throw error;
  }
}

export async function initializeWiki(config: ResolvedThothConfig, options: { dryRun?: boolean; /** Test/fault-injection hook; production callers should omit it. */ beforeFileWrite?: (fileName: "index.md" | "log.md") => Promise<void> } = {}): Promise<WikiInitResult> {
  if (options.dryRun) {
    const status = await getWikiStatus(config);
    const missingDirectories = wikiDirectories.filter((directory) => status.missingDirectories.includes(directory));
    const plannedFiles: string[] = [];
    for (const file of ["index.md", "log.md"]) {
      if (!(await pathExists(path.join(config.resolvedWikiPath, file)))) plannedFiles.push(file);
    }
    return { ...status, createdDirectories: [], index: status.indexExists ? "exists" : "created", log: await pathExists(path.join(config.resolvedWikiPath, "log.md")) ? "exists" : "created", dryRun: true, plannedDirectories: missingDirectories, plannedFiles };
  }
  return withWorkspaceLock(config.resolvedWikiPath, () => initializeWikiUnsafe(config, options), { cleanupEmptyLockDirectory: true });
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

async function captureWikiDocumentUnsafe(
  config: ResolvedThothConfig,
  input: WikiCaptureInput,
): Promise<WikiCaptureResult> {
  const type = input.type ?? config.defaultType;
  const status = input.status ?? config.defaultStatus;
  const title = input.title ?? createTitle(input.content);
  const id = input.id ?? `${type}-${slugify(title)}`;

  assertValidDocumentType(type);
  assertValidStatus(status);
  assertValidCaptureDocumentType(type);

  if (findDuplicateWikiBlocks(input.content).length > 0) {
    throw new Error("Capture content must not duplicate Summary and Content blocks");
  }

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
    date: currentDate(config.dateFormat),
    related: projectSlug ? [{ id: input.projectId as string, relation: "belongs_to" }] : [],
  });
  const result = await writeFileIfMissing(filePath, markdown, { workspaceRoot: config.resolvedWikiPath });

  return {
    id,
    title,
    type,
    status,
    path: relativePath,
    created: result === "created",
  };
}

export function captureWikiDocument(config: ResolvedThothConfig, input: WikiCaptureInput): Promise<WikiCaptureResult> {
  return withWorkspaceLock(config.resolvedWikiPath, () => captureWikiDocumentUnsafe(config, input));
}

async function addWikiSourceDocumentUnsafe(
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

  assertValidStatus(status);

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
    date: currentDate(config.dateFormat),
  });
  const result = await writeFileIfMissing(filePath, markdown, { workspaceRoot: config.resolvedWikiPath });

  return {
    id,
    title,
    type,
    status,
    path: relativePath,
    created: result === "created",
  };
}

export function addWikiSourceDocument(config: ResolvedThothConfig, input: WikiSourceAddInput): Promise<WikiCaptureResult> {
  return withWorkspaceLock(config.resolvedWikiPath, () => addWikiSourceDocumentUnsafe(config, input));
}

async function updateWikiDocumentUnsafe(
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
    assertValidStatus(input.status);
    metadata.status = input.status;
  }

  if (input.tags && input.tags.length > 0) {
    metadata.tags = mergeTags(readStringArray(metadata.tags), input.tags);
  }

  preserveCreatedAt(metadata, located.document.raw);
  metadata.updated_at = currentDate(config.dateFormat);

  await assertValidUpdatedDocumentRelations(config.resolvedWikiPath, input.id, metadata);

  await atomicWriteFile(located.path, matter.stringify(parsed.content, metadata), { workspaceRoot: config.resolvedWikiPath });

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

export function updateWikiDocument(config: ResolvedThothConfig, input: WikiUpdateInput): Promise<WikiUpdateResult> {
  return withWorkspaceLock(config.resolvedWikiPath, () => updateWikiDocumentUnsafe(config, input));
}

async function appendWikiDocumentUnsafe(
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

  if (content === parsed.content) {
    return { id: input.id, path: located.document.path, section, updated: false };
  }

  preserveCreatedAt(metadata, located.document.raw);
  metadata.updated_at = currentDate(config.dateFormat);

  await atomicWriteFile(located.path, matter.stringify(content, metadata), { workspaceRoot: config.resolvedWikiPath });

  return {
    id: input.id,
    path: located.document.path,
    section,
    updated: true,
  };
}

export function appendWikiDocument(config: ResolvedThothConfig, input: WikiAppendInput): Promise<WikiAppendResult> {
  return withWorkspaceLock(config.resolvedWikiPath, () => appendWikiDocumentUnsafe(config, input));
}

async function appendLogEntryUnsafe(
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

  const entry = createLogEntryMarkdown({ content, kind, ref: input.ref, dateFormat: config.dateFormat });

  const globalPath = path.join(config.resolvedWikiPath, "log.md");
  const globalBase = await pathExists(globalPath) ? await readFile(globalPath, "utf8") : createWikiLog(config.dateFormat);
  const batch: { filePath: string; content: string }[] = [{
    filePath: globalPath,
    content: appendLogText(globalBase, entry),
  }];

  let timelinePath: string | undefined;

  if (projectId) {
    const timelineRelativePath = path.join(
      directoryForType("timeline"),
      `timeline-${projectId}.md`,
    );
    const timelineFilePath = path.join(config.resolvedWikiPath, timelineRelativePath);

    const timelineBase = await pathExists(timelineFilePath)
      ? await readFile(timelineFilePath, "utf8")
      : createTimelineMarkdown({
        id: `timeline-${projectId}`,
        title: `Timeline ${projectId}`,
        projectId,
        date: currentDate(config.dateFormat),
      });
    batch.push({ filePath: timelineFilePath, content: appendLogText(timelineBase, entry) });
    timelinePath = timelineRelativePath;
  }

  await atomicWriteBatch(batch, { workspaceRoot: config.resolvedWikiPath });

  return {
    globalPath: path.relative(config.resolvedWikiPath, globalPath),
    timelinePath,
    entry,
  };
}

function appendLogText(existing: string, entry: string): string {
  const base = existing.trimEnd();
  return `${base}${base.length > 0 ? "\n\n" : ""}${entry.trim()}\n`;
}

export function appendLogEntry(config: ResolvedThothConfig, input: WikiLogInput): Promise<WikiLogResult> {
  return withWorkspaceLock(config.resolvedWikiPath, () => appendLogEntryUnsafe(config, input));
}

async function relateWikiDocumentsUnsafe(
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

  const update = prepareRelationUpdate(source, target, input, config.dateFormat);
  let synchronized = { documentsUpdated: 0, linksCreated: 0 };
  if (input.syncLinks) {
    const documents = await Promise.all((await collectMarkdownFiles(config.resolvedWikiPath)).map((file) => readWikiDocument(config.resolvedWikiPath, file)));
    const byId = new Map(documents.map((document) => [document.id, document]));
    const batch: Array<{ filePath: string; content: string }> = update.content === undefined
      ? []
      : [{ filePath: source.path, content: update.content }];
    for (const document of documents) {
      if (document.path === source.document.path) continue;
      const relations = readRelations(document.metadata.related);
      if (!relations.length) continue;
      const parsed = matter(document.raw);
      const metadata = { ...(parsed.data as Record<string, unknown>) };
      let content = parsed.content;
      let created = 0;
      for (const relation of relations) {
        const related = byId.get(relation.id);
        if (!related) continue;
        const next = appendMarkdownRelation(content, { relation: relation.relation, targetTitle: related.title, targetPath: path.relative(path.dirname(path.join(config.resolvedWikiPath, document.path)), path.join(config.resolvedWikiPath, related.path)) });
        if (next !== content) { content = next; created += 1; }
      }
      if (created) {
        preserveCreatedAt(metadata, document.raw);
        metadata.updated_at = currentDate(config.dateFormat);
        batch.push({ filePath: path.join(config.resolvedWikiPath, document.path), content: matter.stringify(content, metadata) });
        synchronized.documentsUpdated += 1;
        synchronized.linksCreated += created;
      }
    }
    await atomicWriteBatch(batch, { workspaceRoot: config.resolvedWikiPath });
  } else if (update.content !== undefined) {
    await atomicWriteBatch([{ filePath: source.path, content: update.content }], { workspaceRoot: config.resolvedWikiPath });
  }

  return {
    source: input.sourceId,
    target: input.targetId,
    relation: input.relation,
    path: source.document.path,
    created: update.created,
    ...(input.syncLinks ? { synchronized } : {}),
  };
}

function prepareRelationUpdate(
  source: { path: string; document: WikiDocument },
  target: { path: string; document: WikiDocument },
  input: WikiRelateInput,
  dateFormat = "YYYY-MM-DD",
): { created: boolean; content?: string } {
  const parsed = matter(source.document.raw);
  const metadata = { ...(parsed.data as Record<string, unknown>) };
  assertValidRelationType(input.relation);
  assertValidSourceRelation(input.relation, source.document, target.document);
  const relations = readRelations(metadata.related);
  const exists = relations.some((relation) => relation.id === input.targetId && relation.relation === input.relation);
  if (exists) {
    const content = appendMarkdownRelation(parsed.content, {
      relation: input.relation,
      targetTitle: target.document.title,
      targetPath: path.relative(path.dirname(source.path), target.path),
    });
    // An existing frontmatter edge still needs its derived link repaired when
    // synchronization was explicitly requested. Never append the edge again.
    return !input.syncLinks || content === parsed.content
      ? { created: false }
      : { created: false, content: matter.stringify(content, metadata) };
  }
  metadata.related = [...relations, { id: input.targetId, relation: input.relation }];
  preserveCreatedAt(metadata, source.document.raw);
  metadata.updated_at = currentDate(dateFormat);
  const content = appendMarkdownRelation(parsed.content, {
    relation: input.relation,
    targetTitle: target.document.title,
    targetPath: path.relative(path.dirname(source.path), target.path),
  });
  return { created: true, content: matter.stringify(content, metadata) };
}

export function relateWikiDocuments(config: ResolvedThothConfig, input: WikiRelateInput): Promise<WikiRelateResult> {
  return withWorkspaceLock(config.resolvedWikiPath, () => relateWikiDocumentsUnsafe(config, input));
}

async function linkWikiSourceDocumentUnsafe(
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

  const sourceUpdate = prepareRelationUpdate(source, target, {
    sourceId,
    targetId,
    relation: "source_for",
  }, config.dateFormat);
  const targetUpdate = prepareRelationUpdate(target, source, {
    sourceId: targetId,
    targetId: sourceId,
    relation: "derived_from",
  }, config.dateFormat);
  const batch = [
    ...(sourceUpdate.content === undefined ? [] : [{ filePath: source.path, content: sourceUpdate.content }]),
    ...(targetUpdate.content === undefined ? [] : [{ filePath: target.path, content: targetUpdate.content }]),
  ];
  await atomicWriteBatch(batch, { workspaceRoot: config.resolvedWikiPath });

  const sourceRelation = {
    source: sourceId,
    target: targetId,
    relation: "source_for" as const,
    path: source.document.path,
    created: sourceUpdate.created,
  };
  const targetRelation = {
    source: targetId,
    target: sourceId,
    relation: "derived_from" as const,
    path: target.document.path,
    created: targetUpdate.created,
  };

  return {
    source: sourceId,
    target: targetId,
    sourceRelation,
    targetRelation,
  };
}

export function linkWikiSourceDocument(config: ResolvedThothConfig, sourceId: string, targetId: string): Promise<WikiSourceLinkResult> {
  return withWorkspaceLock(config.resolvedWikiPath, () => linkWikiSourceDocumentUnsafe(config, sourceId, targetId));
}

export async function searchWikiDocuments(
  config: ResolvedThothConfig,
  query: string,
  filters: WikiSearchFilters = {},
): Promise<WikiSearchResult[]> {
  const limit = filters.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Search limit must be a safe integer between 1 and 20");
  }

  if (typeof query !== "string") {
    throw new Error("Search query must be a string");
  }
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new Error("Search query must not be empty");
  }
  if (trimmedQuery.length > 500) {
    throw new Error("Search query must be at most 500 characters");
  }
  const normalizedQuery = trimmedQuery.toLowerCase();

  if (!(await pathExists(config.resolvedWikiPath))) {
    return [];
  }

  // Bound work after establishing a stable traversal order; readdir order is
  // filesystem-dependent and must not affect which limited results are read.
  const markdownPaths = (await collectMarkdownFiles(config.resolvedWikiPath))
    .sort((left, right) => left.localeCompare(right));
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
        id: document.id,
        title: document.title,
        type: document.type,
        status: document.status,
        tags: [...document.tags],
        path: document.path,
        snippet: createSnippet(searchableText, normalizedQuery),
      });
      if (results.length >= limit) break;
    }
  }

  return results.sort((left, right) => left.path.localeCompare(right.path));
}

async function rebuildWikiIndexUnsafe(config: ResolvedThothConfig, options: WikiIndexOptions = {}): Promise<WikiIndexResult> {
  const markdownPaths = await collectMarkdownFiles(config.resolvedWikiPath);
  const documents: WikiDocumentSummary[] = [];
  const relations: WikiRelation[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();

  for (const markdownPath of markdownPaths) {
    const document = await readWikiDocument(config.resolvedWikiPath, markdownPath);

    // When the human view is part of this transaction, index.md is replaced
    // by that batch and must not make the technical snapshot depend on the
    // pre-transaction file.
    if (options.human && document.path === "index.md") continue;

    // Only generated category pages are views, not canonical technical documents.
    if (isGeneratedCategoryPage(document)) {
      continue;
    }

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
  const indexValue = { documents, warnings };
  const relationsValue = { relations, warnings };
  const schemas = await loadWikiSchemas(config.workspacePath);
  if (!schemas.index(indexValue)) throw new Error(`Generated index is invalid: ${formatSchemaErrors(schemas.index.errors)}`);
  if (!schemas.relationsIndex(relationsValue)) throw new Error(`Generated relations index is invalid: ${formatSchemaErrors(schemas.relationsIndex.errors)}`);
  const entries: AtomicWriteBatchEntry[] = [
    { filePath: indexPath, content: `${JSON.stringify(indexValue, null, 2)}\n` },
    { filePath: relationsPath, content: `${JSON.stringify(relationsValue, null, 2)}\n` },
  ];
  let human: PreparedHumanIndex | undefined;
  if (options.human) {
    human = await prepareHumanIndexBatch(config, options, markdownPaths);
    entries.push(...human.entries);
  }
  if (!options.dryRun) await atomicWriteBatch(entries, { workspaceRoot: config.resolvedWikiPath });
  return {
    documentsIndexed: documents.length,
    relationsIndexed: relations.length,
    indexPath: path.relative(config.resolvedWikiPath, indexPath),
    relationsPath: path.relative(config.resolvedWikiPath, relationsPath),
    warnings,
    ...(options.dryRun ? { dryRun: true } : {}),
    ...(human ? { human: { ...human, entries: undefined } as WikiHumanIndexResult } : {}),
  };
}

export function rebuildWikiIndex(config: ResolvedThothConfig, options: WikiIndexOptions = {}): Promise<WikiIndexResult> {
  return withWorkspaceLock(config.resolvedWikiPath, () => rebuildWikiIndexUnsafe(config, options));
}

type PreparedHumanIndex = WikiHumanIndexResult & { entries: AtomicWriteBatchEntry[] };

async function prepareHumanIndexBatch(config: ResolvedThothConfig, options: WikiIndexOptions, markdownPaths: string[]): Promise<PreparedHumanIndex> {
  if (options.type && !validWikiDocumentTypeSet.has(options.type)) throw new Error(`Invalid wiki document type: ${options.type}`);
  if (options.maxPerSection !== undefined && (!Number.isSafeInteger(options.maxPerSection) || options.maxPerSection < 0)) throw new Error("maxPerSection must be a non-negative safe integer");
  const scanned = await Promise.all(markdownPaths.map((file) => readWikiDocument(config.resolvedWikiPath, file)));
  const canonical = scanned.filter((document) => !isGeneratedArtifact(document));
  const visible = canonical.filter((document) => options.curated || !document.id.startsWith("wiki-"));
  const all = visible.filter((document) => !options.type || document.type === options.type).sort((left, right) => {
    const order = humanIndexSections.findIndex((section) => section.type === left.type) - humanIndexSections.findIndex((section) => section.type === right.type);
    return order || left.title.localeCompare(right.title);
  });
  const documents = options.maxPerSection === undefined ? all : all.filter((document, index, values) => {
    const type = values[index].type;
    return values.slice(0, index).filter((item) => item.type === type).length < options.maxPerSection!;
  });
  const categoryPagePaths: string[] = [];
  const entries: AtomicWriteBatchEntry[] = [{ filePath: path.join(config.resolvedWikiPath, "index.md"), content: "" }];
  if (options.categoryPages) {
    const types = [...new Set(canonical.filter((document) => !options.type || document.type === options.type).map((document) => document.type))].sort();
    for (const type of types) {
      const categoryPath = `index-${type}.md`;
      const existing = scanned.find((document) => document.path === categoryPath);
      if (existing && !isGeneratedArtifact(existing)) throw new Error(`Cannot generate ${categoryPath}: a canonical document already exists at that path; refusing to overwrite it`);
      const categoryDocuments = canonical.filter((document) => document.type === type);
      if (categoryDocuments.length) {
        categoryPagePaths.push(categoryPath);
        entries.push({ filePath: path.join(config.resolvedWikiPath, categoryPath), content: createHumanCategoryIndex(humanIndexSections.find((section) => section.type === type)?.heading ?? `${type[0]?.toUpperCase() ?? ""}${type.slice(1)}`, type, categoryDocuments, canonical, config.dateFormat) });
      }
    }
  }
  const wantedCategories = new Set(categoryPagePaths);
  for (const document of scanned) {
    if (isGeneratedCategoryPage(document) && !wantedCategories.has(document.path)) {
      entries.push({ filePath: path.join(config.resolvedWikiPath, document.path), delete: true });
    }
  }
  entries[0].content = createHumanWikiIndex(documents, categoryPagePaths, canonical, config.dateFormat);
  return { documentsIndexed: documents.length, relationsIndexed: documents.flatMap((document) => readRelations(document.metadata.related)).length, indexPath: "index.md", categoryPages: categoryPagePaths, entries };
}

async function rebuildHumanWikiIndexUnsafe(
  config: ResolvedThothConfig,
  options: WikiHumanIndexOptions = {},
): Promise<WikiHumanIndexResult> {
  if (options.type && !validWikiDocumentTypeSet.has(options.type)) {
    throw new Error(`Invalid wiki document type: ${options.type}`);
  }
  if (options.maxPerSection !== undefined &&
      (!Number.isSafeInteger(options.maxPerSection) || options.maxPerSection < 0)) {
    throw new Error("maxPerSection must be a non-negative safe integer");
  }

  await ensureDirectory(config.resolvedWikiPath);

  const markdownPaths = await collectMarkdownFiles(config.resolvedWikiPath);
  const scannedDocuments = await Promise.all(
    markdownPaths.map((markdownPath) => readWikiDocument(config.resolvedWikiPath, markdownPath)),
  );
  await removeObsoleteCategoryPages(config, scannedDocuments, options.categoryPages === true, options.type);
  const canonicalDocuments = scannedDocuments.filter((document) => !isGeneratedArtifact(document));
  const visibleDocuments = canonicalDocuments.filter((document) =>
    options.curated ? !isGeneratedArtifact(document) : !document.id.startsWith("wiki-"),
  );
  const allDocuments = visibleDocuments
    .filter((document) => !options.type || document.type === options.type)
    .sort((left, right) => {
      const typeOrder = humanIndexSections.findIndex((section) => section.type === left.type)
        - humanIndexSections.findIndex((section) => section.type === right.type);

      if (typeOrder !== 0) {
        return typeOrder;
      }

      return left.title.localeCompare(right.title);
    });

  const documents = options.maxPerSection === undefined
    ? allDocuments
    : allDocuments.filter((document, index, values) => {
        const section = humanIndexSections.find((item) => item.type === document.type);
        const sectionKey = section?.type ?? "other";
        return values.slice(0, index).filter((item) =>
          (humanIndexSections.find((candidate) => candidate.type === item.type)?.type ?? "other") === sectionKey,
        ).length < options.maxPerSection!;
      });

  const indexPath = path.join(config.resolvedWikiPath, "index.md");

  const categoryPagePaths: string[] = [];
  if (options.categoryPages) {
    const categoryTypes = [...new Set(canonicalDocuments
      .filter((document) => !options.type || document.type === options.type)
      .map((document) => document.type))].sort((left, right) => {
      const leftOrder = humanIndexSections.findIndex((section) => section.type === left);
      const rightOrder = humanIndexSections.findIndex((section) => section.type === right);
      return (leftOrder === -1 ? 999 : leftOrder) - (rightOrder === -1 ? 999 : rightOrder) || left.localeCompare(right);
    });

    for (const type of categoryTypes) {
      const categoryPath = `index-${type}.md`;
      const existingDocument = scannedDocuments.find((document) => document.path === categoryPath);

      if (existingDocument && !isGeneratedArtifact(existingDocument)) {
        throw new Error(
          `Cannot generate ${categoryPath}: a canonical document already exists at that path; refusing to overwrite it`,
        );
      }
    }

    for (const type of categoryTypes) {
      const categoryDocuments = canonicalDocuments.filter((document) => document.type === type && (!options.type || document.type === options.type));
      if (categoryDocuments.length === 0) continue;
      const categoryPath = `index-${type}.md`;
      await atomicWriteFile(
        path.join(config.resolvedWikiPath, categoryPath),
        createHumanCategoryIndex(humanIndexSections.find((section) => section.type === type)?.heading ?? `${type[0]?.toUpperCase() ?? ""}${type.slice(1)}`, type, categoryDocuments, canonicalDocuments, config.dateFormat),
        { workspaceRoot: config.resolvedWikiPath },
      );
      categoryPagePaths.push(categoryPath);
    }
  }

  await atomicWriteFile(indexPath, createHumanWikiIndex(documents, categoryPagePaths, canonicalDocuments, config.dateFormat), { workspaceRoot: config.resolvedWikiPath });

  return {
    documentsIndexed: documents.length,
    relationsIndexed: documents.flatMap((document) => readRelations(document.metadata.related)).length,
    indexPath: path.relative(config.resolvedWikiPath, indexPath),
    categoryPages: categoryPagePaths,
  };
}

export function rebuildHumanWikiIndex(config: ResolvedThothConfig, options: WikiHumanIndexOptions = {}): Promise<WikiHumanIndexResult> {
  return withWorkspaceLock(config.resolvedWikiPath, () => rebuildHumanWikiIndexUnsafe(config, options));
}

async function syncWikiRelationLinksUnsafe(
  config: ResolvedThothConfig,
  options: { dryRun?: boolean } = {},
): Promise<WikiSyncLinksResult> {
  if (!(await pathExists(config.resolvedWikiPath))) {
    return { documentsChecked: 0, documentsUpdated: 0, linksCreated: 0, ...(options.dryRun ? { dryRun: true } : {}) };
  }

  const markdownPaths = await collectMarkdownFiles(config.resolvedWikiPath);
  const documents = await Promise.all(
    markdownPaths.map((markdownPath) => readWikiDocument(config.resolvedWikiPath, markdownPath)),
  );
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  let documentsUpdated = 0;
  let linksCreated = 0;
  const batch: Array<{ filePath: string; content: string }> = [];

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
      preserveCreatedAt(metadata, document.raw);
      metadata.updated_at = currentDate(config.dateFormat);
      batch.push({ filePath: path.join(config.resolvedWikiPath, document.path), content: matter.stringify(content, metadata) });
      documentsUpdated += 1;
      linksCreated += documentLinksCreated;
    }
  }

  if (!options.dryRun) await atomicWriteBatch(batch, { workspaceRoot: config.resolvedWikiPath });
  return {
    documentsChecked: documents.length,
    documentsUpdated,
    linksCreated,
    ...(options.dryRun ? { dryRun: true } : {}),
  };
}

export function syncWikiRelationLinks(config: ResolvedThothConfig, options: { dryRun?: boolean } = {}): Promise<WikiSyncLinksResult> {
  return withWorkspaceLock(config.resolvedWikiPath, () => syncWikiRelationLinksUnsafe(config, options));
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

    if (hasStringMetadata(document.metadata, "status") && !validWikiStatusSet.has(document.status)) {
      issues.push({ path: document.path, message: `Invalid document status: ${document.status}` });
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

  for (const document of documents) {
    for (const [left, right] of findDuplicateWikiBlocks(document.content)) {
      issues.push({
        path: document.path,
        message: `Duplicate wiki blocks: ${left.heading} and ${right.heading}`,
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

    checks.push({
      name: "index",
      status: status.indexExists ? "pass" : "fail",
      message: status.indexExists ? "Index exists (not rebuilt by diagnostic doctor)" : "Index not found (not rebuilt by diagnostic doctor)",
    });
    const schemas = await loadWikiSchemas(config.workspacePath);
    checks.push(await diagnoseDerivedFile(config.resolvedWikiPath, "index.md", "markdown"));
    checks.push(await diagnoseDerivedFile(config.resolvedWikiPath, path.join(".thoth", "index.json"), schemas.index));
    checks.push(await diagnoseDerivedFile(config.resolvedWikiPath, path.join(".thoth", "relations.json"), schemas.relationsIndex));
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
    checks.push({ name: "index.md", status: "fail", message: "Skipped because wiki does not exist" });
    checks.push({ name: path.join(".thoth", "index.json"), status: "fail", message: "Skipped because wiki does not exist" });
    checks.push({ name: path.join(".thoth", "relations.json"), status: "fail", message: "Skipped because wiki does not exist" });
  }

  return {
    ok: checks.every((check) => check.status === "pass"),
    checks,
  };
}

async function diagnoseDerivedFile(
  wikiPath: string,
  relativePath: string,
  validator: ValidateFunction | "markdown",
): Promise<WikiDoctorCheck> {
  const filePath = path.join(wikiPath, relativePath);
  try {
    const raw = await readFile(filePath, "utf8");
    if (validator === "markdown") {
      matter(raw);
      if (raw.trim().length === 0) throw new Error("File is empty");
    } else {
      const valid = validator(JSON.parse(raw));
      if (!valid) throw new Error(formatSchemaErrors(validator.errors));
    }
    return { name: relativePath, status: "pass", message: "Readable and valid (not regenerated)" };
  } catch (error) {
    return { name: relativePath, status: "fail", message: error instanceof Error ? error.message : String(error) };
  }
}

function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string {
  return errors?.map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`).join("; ") || "Schema validation failed";
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

function extractWikiContentBlocks(content: string): WikiContentBlock[] {
  const lines = content.split("\n");
  const headings: Array<{ heading: string; start: number; endOfLine: number }> = [];
  let offset = 0;
  let fence: string | undefined;

  for (const line of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]?.[0];
      if (!fence && marker) fence = marker;
      else if (fence === marker) fence = undefined;
    } else if (!fence) {
      const heading = /^##\s+(.+?)\s*$/.exec(line);
      if (heading) headings.push({ heading: heading[1]?.trim() ?? "", start: offset, endOfLine: offset + line.length });
    }
    offset += line.length + 1;
  }

  return headings.map((heading, index) => ({
    heading: heading.heading,
    content: content.slice(heading.endOfLine, headings[index + 1]?.start ?? content.length).trim(),
  }));
}

function appendToSection(content: string, section: string, addition: string): string {
  const normalizedAddition = addition.trim();
  if (!normalizedAddition || extractWikiContentBlocks(content).some((block) =>
    normalizeWikiBlock(normalizedAddition) === normalizeWikiBlock(block.content))) {
    return content;
  }
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

function preserveCreatedAt(metadata: Record<string, unknown>, raw: string): void {
  const frontmatter = /^---\s*\n([\s\S]*?)\n---/u.exec(raw)?.[1];
  const createdAt = frontmatter ? /^created_at:\s*(.*?)\s*$/mu.exec(frontmatter)?.[1] : undefined;
  if (createdAt) metadata.created_at = createdAt.replace(/^(['"])(.*)\1$/u, "$2");
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
  const summary = createWikiSummary(input.content);
  const summaryBlock = summary
    ? `\n## Summary\n\n${summary}\n`
    : "";

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
${summaryBlock}

## Content

${input.content.trim()}
`;
}

function createWikiSummary(content: string): string {
  const trimmed = content.trim();
  const firstParagraph = trimmed.split(/\n\s*\n/u)[0]?.trim() ?? "";
  const summary = firstParagraph.length > 160
    ? `${firstParagraph.slice(0, 157).trimEnd()}...`
    : firstParagraph;
  return normalizeWikiBlock(summary) === normalizeWikiBlock(trimmed) ? "" : summary;
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

function createWikiLog(dateFormat = "YYYY-MM-DD"): string {
  const now = currentDate(dateFormat);

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
  dateFormat: string;
}): string {
  const date = currentDate(input.dateFormat);
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

function currentDate(dateFormat = "YYYY-MM-DD"): string {
  return formatDate(new Date(), dateFormat);
}

function formatDate(date: Date, dateFormat: string): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  if (dateFormat !== "YYYY-MM-DD") throw new Error("Invalid dateFormat: only YYYY-MM-DD is supported");
  return `${year}-${month}-${day}`;
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

function assertValidStatus(status: string): void {
  if (!validWikiStatusSet.has(status)) {
    throw new Error(`Invalid document status: ${status}`);
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
  const invalid = relationConstraintError(relation, source.type, target.type);
  if (invalid) throw new Error(invalid);
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
    const target = await findWikiDocumentById(wikiPath, relation.id);
    if (!target) continue;

    const invalid = relationConstraintError(relation.relation, updatedType, target.document.type);
    if (invalid) throw new Error(invalid);
  }
}

function validateSourceRelationIssues(
  source: WikiDocument,
  relation: { id: string; relation: string },
  target: WikiDocument,
): WikiLintIssue[] {
  const issues: WikiLintIssue[] = [];

  const message = relationConstraintError(relation.relation, source.type, target.type);
  if (message) {
    issues.push({
      path: source.path,
      message: relation.relation === "source_for"
        ? `Invalid source relation: ${message}`
        : `Invalid relation: ${message}`,
    });
  }

  return issues;
}

function relationConstraintError(relation: string, sourceType: string, targetType: string): string | undefined {
  const allowed: Record<string, { source: string[]; target: string[]; description: string }> = {
    source_for: { source: ["source"], target: validWikiDocumentTypes.filter((type) => type !== "source"), description: "source_for must originate from source and target a non-source document" },
    // Historical workspaces also use this relation from a source to another
    // document; keep that form valid while source_for remains directional.
    derived_from: { source: [...validWikiDocumentTypes], target: [...validWikiDocumentTypes], description: "derived_from must link a document to a prior document" },
    // Existing wikis use belongs_to for project notes, decisions, subareas,
    // and implementation/project documents in addition to tasks and timelines.
    belongs_to: {
      source: ["note", "decision", "project", "implementation", "research", "idea", "session", "entity", "reference", "task", "timeline"],
      target: ["project"],
      description: "belongs_to must link a project document, note, decision, subarea, task, or timeline to a project",
    },
    has_subarea: { source: ["project"], target: ["project"], description: "has_subarea must link a project to a project" },
    has_implementation: { source: ["project", "decision", "task"], target: ["implementation"], description: "has_implementation must target an implementation" },
    implements: { source: ["implementation"], target: ["project", "decision", "task", "reference"], description: "implements must originate from an implementation" },
    verifies: { source: ["implementation", "decision", "task", "research", "note", "reference"], target: ["implementation", "decision", "task", "project", "note", "reference"], description: "verifies must link a verification-capable document to a verifiable document" },
  };
  const rule = allowed[relation];
  if (!rule || (rule.source.includes(sourceType) && rule.target.includes(targetType))) return undefined;
  if (relation === "source_for" && sourceType !== "source") return "source_for must originate from a source document";
  return rule?.description;
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

  return `${prefix}${compactText.slice(start, end)}${suffix}`.slice(0, 500);
}

function createWikiIndex(dateFormat = "YYYY-MM-DD"): string {
  const now = currentDate(dateFormat);
  return `---
id: wiki-index
title: T.H.O.T.H. Wiki Index
type: reference
status: active
created_at: ${now}
updated_at: ${now}
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

function isGeneratedArtifact(document: WikiDocument): boolean {
  return document.metadata.source === "generated" || isGeneratedCategoryPage(document);
}

function isGeneratedCategoryPage(document: WikiDocument): boolean {
  return document.metadata.source === "generated" && /^index-[^/]+\.md$/.test(document.path);
}

async function removeObsoleteCategoryPages(
  config: ResolvedThothConfig,
  documents: WikiDocument[],
  keepPages: boolean,
  typeFilter?: string,
): Promise<void> {
  const currentTypes = new Set(
    documents
      .filter((document) => !isGeneratedArtifact(document))
      .filter((document) => !typeFilter || document.type === typeFilter)
      .map((document) => document.type),
  );
  for (const document of documents) {
    if (!isGeneratedCategoryPage(document)) continue;
    const type = document.path.slice("index-".length, -".md".length);
    if (!keepPages || !currentTypes.has(type)) {
      await unlink(path.join(config.resolvedWikiPath, document.path));
    }
  }
}

function documentSummary(document: WikiDocument): string {
  const summaryMatch = document.content.match(/##\s+Summary\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
  const body = summaryMatch?.[1] ?? document.content;
  const paragraph = body.split(/\n\s*\n/).map((part) => part.replace(/^#+\s+/gm, "").trim()).find(Boolean);
  const normalized = (paragraph ?? document.title).replace(/\s+/g, " ").trim();
  return normalized.length > 160 ? `${normalized.slice(0, 157).trimEnd()}...` : normalized;
}

function sourceCount(document: WikiDocument, documentsById: Map<string, WikiDocument>): number {
  if (document.type === "source") return 0;
  const sources = new Set<string>();
  for (const relation of readRelations(document.metadata.related)) {
    const target = documentsById.get(relation.id);
    if (relation.relation === "derived_from" && target?.type === "source") sources.add(target.id);
  }
  for (const candidate of documentsById.values()) {
    if (candidate.type !== "source") continue;
    if (readRelations(candidate.metadata.related).some((relation) =>
      relation.relation === "source_for" && relation.id === document.id)) {
      sources.add(candidate.id);
    }
  }
  return sources.size;
}

function createHumanEntry(document: WikiDocument, documentsById: Map<string, WikiDocument>): string {
  const count = sourceCount(document, documentsById);
  const sources = count > 0 ? ` · sources: ${count}` : "";
  return `- [${document.title}](${toPosixPath(document.path)}) — ${documentSummary(document)} · status: ${document.status}${sources}`;
}

function createHumanWikiIndex(documents: WikiDocument[], categoryPagePaths: string[] = [], graphDocuments = documents, dateFormat = "YYYY-MM-DD"): string {
  const now = currentDate(dateFormat);
  const documentsById = new Map(graphDocuments.map((document) => [document.id, document]));
  const sections = humanIndexSections
    .map((section) => {
      const items = documents.filter((document) => document.type === section.type);

      if (items.length === 0) {
        return `## ${section.heading}\n`;
      }

      return `## ${section.heading}\n\n${items
        .map((document) => createHumanEntry(document, documentsById))
        .join("\n")}`;
    })
    .join("\n\n");

  const knownTypes = new Set<string>(humanIndexSections.map((section) => section.type));
  const otherDocuments = documents.filter((document) => !knownTypes.has(document.type));
  const otherSection = otherDocuments.length === 0
    ? "## Other\n"
    : `## Other\n\n${otherDocuments
      .map((document) => createHumanEntry(document, documentsById))
      .join("\n")}`;
  const relationSection = createHumanRelationSection(documents);
  const categorySection = categoryPagePaths.length === 0
    ? ""
    : `\n\n## Category Pages\n\n${categoryPagePaths.map((page) => `- [${page.replace(/^index-|\.md$/g, "")}](${page})`).join("\n")}`;

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

${categorySection}

${relationSection}

## Notes

Este indice se regenera con \`thoth index --human\` e incluye enlaces por tipo y mapa de relaciones declarado en frontmatter.
`;
}

function createHumanCategoryIndex(heading: string, type: string, documents: WikiDocument[], graphDocuments = documents, dateFormat = "YYYY-MM-DD"): string {
  const documentsById = new Map(graphDocuments.map((document) => [document.id, document]));
  const entries = documents.map((document) => createHumanEntry(document, documentsById)).join("\n");
  const now = currentDate(dateFormat);
  return `---
id: wiki-index-${type}
title: ${heading} Index
type: reference
status: active
created_at: ${now}
updated_at: ${now}
tags:
  - index
source: generated
related: []
---

# ${heading}

## Summary

Generated human category index. It is derived from canonical documents and is not part of the semantic graph.

${entries}
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
