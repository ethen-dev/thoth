import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/core/index.js";
import {
  addWikiSourceDocument,
  appendLogEntry,
  appendWikiDocument,
  captureWikiDocument,
  getWikiDocumentById,
  getWikiStatus,
  initializeWiki,
  listWikiDocuments,
  lintWikiDocuments,
  linkWikiSourceDocument,
  relateWikiDocuments,
  rebuildHumanWikiIndex,
  rebuildWikiIndex,
  runWikiDoctor,
  searchWikiDocuments,
  syncWikiRelationLinks,
  updateWikiDocument,
  validLogKinds,
  validWikiRelationTypes,
} from "../src/wiki/index.js";

const tempDirectories: string[] = [];
const originalCwd = process.cwd();
const originalThothConfig = process.env.THOTH_CONFIG;

afterEach(async () => {
  process.chdir(originalCwd);
  if (originalThothConfig === undefined) {
    delete process.env.THOTH_CONFIG;
  } else {
    process.env.THOTH_CONFIG = originalThothConfig;
  }

  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("wiki workspace", () => {
  it("loads config and resolves an external wiki path", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);

    expect(config.wikiPath).toBe("../wiki");
    expect(config.resolvedWikiPath).toBe(
      path.resolve(workspacePath, "../wiki"),
    );
  });

  it("loads config from THOTH_CONFIG outside the workspace", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const otherPath = await mkdtemp(path.join(os.tmpdir(), "thoth-other-"));
    tempDirectories.push(otherPath);

    process.env.THOTH_CONFIG = path.join(workspacePath, "thoth.config.json");
    process.chdir(otherPath);

    const config = await loadConfig();

    expect(config.workspacePath).toBe(workspacePath);
    expect(config.configPath).toBe(path.join(workspacePath, "thoth.config.json"));
    expect(config.resolvedWikiPath).toBe(path.resolve(workspacePath, "../wiki"));
  });

  it("initializes the configured wiki without overwriting an existing index", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);

    const firstInit = await initializeWiki(config);
    expect(firstInit.index).toBe("created");
    expect(firstInit.log).toBe("created");
    expect(firstInit.missingDirectories).toEqual([]);

    const logPath = path.join(config.resolvedWikiPath, "log.md");
    expect(await readFile(logPath, "utf8")).toContain("# T.H.O.T.H. Global Log");

    const indexPath = path.join(config.resolvedWikiPath, "index.md");
    await writeFile(indexPath, "existing index", "utf8");

    const secondInit = await initializeWiki(config);
    const index = await readFile(indexPath, "utf8");

    expect(secondInit.index).toBe("exists");
    expect(index).toBe("existing index");
  });

  it("reports missing wiki structure before initialization", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    const status = await getWikiStatus(config);

    expect(status.wikiExists).toBe(false);
    expect(status.indexExists).toBe(false);
    expect(status.missingDirectories).toContain("projects");
    expect(status.missingDirectories).toContain("implementation");
    expect(status.missingDirectories).toContain("logs");
    expect(status.missingDirectories).toContain("sources");
  });

  it("adds raw source documents under sources", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    const result = await addWikiSourceDocument(config, {
      id: "source-interview-alpha",
      title: "Interview Alpha",
      content: "Raw transcript line one.\nRaw transcript line two.",
      status: "captured",
      tags: ["interview"],
    });
    const document = await getWikiDocumentById(config, result.id);
    const sources = await listWikiDocuments(config, { type: "source" });

    expect(result.path).toBe("sources/source-interview-alpha.md");
    expect(document?.type).toBe("source");
    expect(document?.status).toBe("captured");
    expect(document?.tags).toEqual(["interview"]);
    expect(document?.content).toContain("## Raw Source\n\nRaw transcript line one.");
    expect(document?.content).not.toContain("## Content");
    expect(sources.map((source) => source.id)).toContain("source-interview-alpha");
  });

  it("lists markdown documents and applies metadata filters", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    await writeFile(
      path.join(config.resolvedWikiPath, "decisions", "decision-example.md"),
      `---
id: decision-example
title: Example Decision
type: decision
status: active
tags:
  - architecture
---

# Example Decision
`,
      "utf8",
    );
    await writeFile(
      path.join(config.resolvedWikiPath, ".thoth", "ignored.md"),
      `---
id: ignored
title: Ignored
type: note
status: active
---
`,
      "utf8",
    );

    const documents = await listWikiDocuments(config);
    const decisionDocuments = await listWikiDocuments(config, { type: "decision" });
    const tagDocuments = await listWikiDocuments(config, { tag: "architecture" });

    expect(documents.map((document) => document.id)).toContain("decision-example");
    expect(documents.map((document) => document.id)).not.toContain("ignored");
    expect(decisionDocuments).toHaveLength(1);
    expect(decisionDocuments[0]?.id).toBe("decision-example");
    expect(tagDocuments).toHaveLength(1);
    expect(tagDocuments[0]?.id).toBe("decision-example");
  });

  it("rebuilds a human Markdown index with standard sections", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    const project = await captureWikiDocument(config, {
      content: "Project body.",
      title: "Example Project",
      type: "project",
      status: "active",
    });
    const decision = await captureWikiDocument(config, {
      content: "Decision body.",
      title: "Example Decision",
      type: "decision",
      status: "accepted",
    });
    await relateWikiDocuments(config, {
      sourceId: project.id,
      targetId: decision.id,
      relation: "has_decision",
    });

    const result = await rebuildHumanWikiIndex(config);
    const index = await readFile(path.join(config.resolvedWikiPath, "index.md"), "utf8");

    expect(result.indexPath).toBe("index.md");
    expect(result.documentsIndexed).toBe(2);
    expect(result.relationsIndexed).toBe(1);
    expect(index).toContain("## Projects");
    expect(index).toContain("- [Example Project](projects/project-example-project.md)");
    expect(index).toContain("## Decisions");
    expect(index).toContain("- [Example Decision](decisions/decision-example-decision.md)");
    expect(index).toContain("## Implementation");
    expect(index).toContain("## Sources");
    expect(index).toContain("## Relation Map");
    expect(index).toContain("[Example Project](projects/project-example-project.md) --has_decision--> [Example Decision](decisions/decision-example-decision.md)");
    expect(index).toContain("thoth index --human");
  });

  it("gets a wiki document by id", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    await writeFile(
      path.join(config.resolvedWikiPath, "projects", "project-example.md"),
      `---
id: project-example
title: Example Project
type: project
status: active
tags:
  - example
---

# Example Project

## Summary

Visible content.
`,
      "utf8",
    );

    const document = await getWikiDocumentById(config, "project-example");
    const missingDocument = await getWikiDocumentById(config, "missing");

    expect(document?.title).toBe("Example Project");
    expect(document?.metadata.title).toBe("Example Project");
    expect(document?.content).toContain("Visible content.");
    expect(document?.raw).toContain("id: project-example");
    expect(missingDocument).toBeNull();
  });

  it("captures a wiki document without overwriting existing content", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    const firstCapture = await captureWikiDocument(config, {
      content: "Capture this durable note.",
      title: "Durable Note",
      type: "note",
      tags: ["memory", "test"],
    });
    const secondCapture = await captureWikiDocument(config, {
      content: "Different content should not overwrite.",
      title: "Durable Note",
      type: "note",
      tags: ["memory", "test"],
    });
    const document = await getWikiDocumentById(config, firstCapture.id);

    expect(firstCapture.created).toBe(true);
    expect(secondCapture.created).toBe(false);
    expect(firstCapture.path).toBe("notes/note-durable-note.md");
    expect(document?.content).toContain("Capture this durable note.");
    expect(document?.content).not.toContain("Different content should not overwrite.");
    expect(document?.tags).toEqual(["memory", "test"]);
  });

  it("captures project tasks under the project task directory and indexes Tasks", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);
    await captureWikiDocument(config, { id: "project-thoth", title: "Thoth", type: "project", content: "Project" });

    const task = await captureWikiDocument(config, {
      id: "task-minimal-support",
      title: "Minimal support",
      type: "task",
      projectId: "project-thoth",
      content: "Implement it.",
    });
    const index = await rebuildHumanWikiIndex(config);
    const humanIndex = await readFile(path.join(config.resolvedWikiPath, "index.md"), "utf8");
    const document = await getWikiDocumentById(config, task.id);
    const lint = await lintWikiDocuments(config);

    expect(task.path).toBe("projects/thoth/tasks/task-minimal-support.md");
    expect(document?.metadata.related).toEqual([{ id: "project-thoth", relation: "belongs_to" }]);
    expect(lint.issues).toEqual([]);
    expect(index.documentsIndexed).toBe(2);
    expect(humanIndex).toContain("## Tasks");
    expect(humanIndex).toContain("projects/thoth/tasks/task-minimal-support.md");
  });

  it("derives task paths from nested project document locations", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);
    await mkdir(path.join(config.resolvedWikiPath, "projects", "nested-slug"), { recursive: true });
    await writeFile(
      path.join(config.resolvedWikiPath, "projects", "nested-slug", "project-nested.md"),
      `---\nid: project-nested\ntitle: Nested\ntype: project\nstatus: active\n---\n\n# Nested\n`,
      "utf8",
    );

    const task = await captureWikiDocument(config, {
      id: "task-nested",
      type: "task",
      projectId: "project-nested",
      content: "Nested task.",
    });

    expect(task.path).toBe("projects/nested-slug/tasks/task-nested.md");
  });

  it("rejects tasks without an existing project", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    await expect(captureWikiDocument(config, { type: "task", content: "Missing project" })).rejects.toThrow("require a projectId");
    await expect(captureWikiDocument(config, { type: "task", projectId: "project-missing", content: "Missing project" })).rejects.toThrow("Project document not found");
  });

  it("rejects task projects reached through a symlink", async () => {
    if (process.platform === "win32") {
      return;
    }

    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);
    const externalProjects = path.join(path.dirname(config.resolvedWikiPath), "external-projects");
    await mkdir(externalProjects, { recursive: true });
    await writeFile(
      path.join(config.resolvedWikiPath, "projects", "project-linked.md"),
      `---\nid: project-linked\ntitle: Linked\ntype: project\nstatus: active\n---\n`,
      "utf8",
    );
    await symlink(
      externalProjects,
      path.join(config.resolvedWikiPath, "projects", "linked"),
    );

    await expect(captureWikiDocument(config, {
      type: "task",
      projectId: "project-linked",
      content: "Should be rejected.",
    })).rejects.toThrow("contains a symlink");
  });

  it("updates document metadata without changing content", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    const captured = await captureWikiDocument(config, {
      content: "Keep this body intact.",
      title: "Original Title",
      type: "note",
      tags: ["original"],
    });

    const result = await updateWikiDocument(config, {
      id: captured.id,
      title: "Updated Title",
      status: "review",
      tags: ["original", "updated"],
    });
    const document = await getWikiDocumentById(config, captured.id);
    const raw = await readFile(
      path.join(config.resolvedWikiPath, captured.path),
      "utf8",
    );

    expect(result.title).toBe("Updated Title");
    expect(result.status).toBe("review");
    expect(result.tags).toEqual(["original", "updated"]);
    expect(document?.content).toContain("Keep this body intact.");
    expect(document?.metadata.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(raw).toContain("created_at: '20");
    expect(raw).not.toContain("created_at: 20");
    expect(raw).not.toContain("T00:00:00.000Z");
  });

  it("appends content to an existing document section", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    const captured = await captureWikiDocument(config, {
      content: "Original body.",
      title: "Append Target",
      type: "note",
    });

    const result = await appendWikiDocument(config, {
      id: captured.id,
      section: "Notes",
      content: "Appended note.",
    });
    const document = await getWikiDocumentById(config, captured.id);

    expect(result.section).toBe("Notes");
    expect(document?.content).toContain("Original body.");
    expect(document?.content).toContain("## Notes\n\nAppended note.");
    expect(document?.metadata.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("initializes a global log.md with generated frontmatter", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);

    const result = await initializeWiki(config);
    const log = await readFile(path.join(config.resolvedWikiPath, "log.md"), "utf8");

    expect(result.log).toBe("created");
    expect(log).toContain("id: wiki-log");
    expect(log).toContain("title: T.H.O.T.H. Global Log");
    expect(log).toContain("type: reference");
    expect(log).toContain("status: active");
    expect(log).toContain("source: generated");
    expect(log).toContain("# T.H.O.T.H. Global Log");
  });

  it("appends a global-only log entry with a parseable prefix", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    const result = await appendLogEntry(config, {
      content: "First durable note.",
    });
    const log = await readFile(path.join(config.resolvedWikiPath, "log.md"), "utf8");

    expect(result.globalPath).toBe("log.md");
    expect(result.timelinePath).toBeUndefined();
    expect(log).toMatch(/## \[\d{4}-\d{2}-\d{2}\] log \| First durable note\./);
    expect(log).toContain("- First durable note.");
  });

  it("appends a log entry to a project timeline and the global log", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    const project = await captureWikiDocument(config, {
      content: "Project body.",
      title: "Timeline Project",
      type: "project",
    });

    const result = await appendLogEntry(config, {
      content: "Project milestone reached.",
      projectId: project.id,
    });
    const timeline = await readFile(
      path.join(config.resolvedWikiPath, "timelines", `timeline-${project.id}.md`),
      "utf8",
    );
    const log = await readFile(path.join(config.resolvedWikiPath, "log.md"), "utf8");

    expect(result.timelinePath).toBe(`timelines/timeline-${project.id}.md`);
    expect(timeline).toContain(`timeline-${project.id}`);
    expect(timeline).toContain(`Timeline ${project.id}`);
    expect(timeline).toContain("type: timeline");
    expect(timeline).toContain(project.id);
    expect(timeline).toContain("belongs_to");
    expect(timeline).toContain("Project milestone reached.");
    expect(log).toContain("Project milestone reached.");
  });

  it("appends log entries in order", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    await appendLogEntry(config, { content: "First entry." });
    await appendLogEntry(config, { content: "Second entry." });
    const log = await readFile(path.join(config.resolvedWikiPath, "log.md"), "utf8");

    expect(log.indexOf("First entry.")).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("Second entry.")).toBeGreaterThan(log.indexOf("First entry."));
  });

  it("adds a reference bullet when ref is provided", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    await appendLogEntry(config, {
      content: "Entry with reference.",
      ref: "note-example",
    });
    const log = await readFile(path.join(config.resolvedWikiPath, "log.md"), "utf8");

    expect(log).toContain("- Reference: [[note-example]]");
  });

  it("rejects a log entry for a missing project", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    await expect(appendLogEntry(config, {
      content: "Orphan entry.",
      projectId: "project-missing",
    })).rejects.toThrow("Project document not found: project-missing (expected type project)");
  });

  it("rejects an invalid log kind", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    await expect(appendLogEntry(config, {
      content: "Bad kind.",
      kind: "unknown-kind",
    })).rejects.toThrow("Invalid log kind: unknown-kind");
    expect(validLogKinds).toContain("log");
    expect(validLogKinds).toContain("decision");
  });

  it("relates existing documents without duplicating relations", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    const source = await captureWikiDocument(config, {
      content: "Source body.",
      title: "Source Note",
      type: "note",
    });
    const target = await captureWikiDocument(config, {
      content: "Target body.",
      title: "Target Note",
      type: "note",
    });

    const firstResult = await relateWikiDocuments(config, {
      sourceId: source.id,
      targetId: target.id,
      relation: "references",
    });
    const secondResult = await relateWikiDocuments(config, {
      sourceId: source.id,
      targetId: target.id,
      relation: "references",
    });
    const document = await getWikiDocumentById(config, source.id);

    expect(firstResult.created).toBe(true);
    expect(secondResult.created).toBe(false);
    expect(document?.metadata.related).toEqual([
      {
        id: target.id,
        relation: "references",
      },
    ]);
    expect(document?.content).toContain("## Relations");
    expect(document?.content).toContain(
      "- references: [Target Note](note-target-note.md)",
    );
  });

  it("accepts documented relation catalog entries", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    const project = await captureWikiDocument(config, {
      content: "Project body.",
      title: "Catalog Project",
      type: "project",
    });
    const implementation = await captureWikiDocument(config, {
      content: "Implementation body.",
      title: "Catalog Implementation",
      type: "implementation",
    });

    const result = await relateWikiDocuments(config, {
      sourceId: project.id,
      targetId: implementation.id,
      relation: "has_implementation",
    });
    const document = await getWikiDocumentById(config, project.id);

    expect(result.created).toBe(true);
    expect(document?.metadata.related).toEqual([
      { id: implementation.id, relation: "has_implementation" },
    ]);
  });

  it("allows derived_from to target a previous non-source document", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    const current = await captureWikiDocument(config, {
      content: "Current derived knowledge.",
      title: "Current Note",
      type: "note",
    });
    const previous = await captureWikiDocument(config, {
      content: "Previous synthesis.",
      title: "Previous Note",
      type: "note",
    });

    await relateWikiDocuments(config, {
      sourceId: current.id,
      targetId: previous.id,
      relation: "derived_from",
    });

    const lint = await lintWikiDocuments(config);
    const document = await getWikiDocumentById(config, current.id);

    expect(document?.metadata.related).toEqual([
      { id: previous.id, relation: "derived_from" },
    ]);
    expect(lint.issues).not.toContainEqual({
      path: document?.path,
      message: "Invalid source relation: derived_from must target a source document",
    });
  });

  it("links sources bidirectionally without duplicating relations", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    const source = await addWikiSourceDocument(config, {
      title: "Raw Memo",
      content: "Unprocessed memo text.",
    });
    const target = await captureWikiDocument(config, {
      title: "Derived Note",
      content: "Structured note from memo.",
      type: "note",
    });

    const firstResult = await linkWikiSourceDocument(config, source.id, target.id);
    const secondResult = await linkWikiSourceDocument(config, source.id, target.id);
    const sourceDocument = await getWikiDocumentById(config, source.id);
    const targetDocument = await getWikiDocumentById(config, target.id);

    expect(firstResult.sourceRelation.created).toBe(true);
    expect(firstResult.targetRelation.created).toBe(true);
    expect(secondResult.sourceRelation.created).toBe(false);
    expect(secondResult.targetRelation.created).toBe(false);
    expect(sourceDocument?.metadata.related).toEqual([
      { id: target.id, relation: "source_for" },
    ]);
    expect(targetDocument?.metadata.related).toEqual([
      { id: source.id, relation: "derived_from" },
    ]);
    expect(sourceDocument?.content).toContain(
      "- source_for: [Derived Note](../notes/note-derived-note.md)",
    );
    expect(targetDocument?.content).toContain(
      "- derived_from: [Raw Memo](../sources/source-raw-memo.md)",
    );
  });

  it("rejects invalid document types and relation combinations on writes", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    await expect(captureWikiDocument(config, {
      title: "Bad Type",
      content: "Body.",
      type: "unknown-kind",
    })).rejects.toThrow("Invalid document type: unknown-kind");
    await expect(captureWikiDocument(config, {
      title: "Raw Via Capture",
      content: "Raw body.",
      type: "source",
    })).rejects.toThrow("capture cannot create type source");

    const source = await addWikiSourceDocument(config, {
      title: "Raw Memo",
      content: "Unprocessed memo text.",
    });
    const note = await captureWikiDocument(config, {
      title: "Derived Note",
      content: "Structured note from memo.",
      type: "note",
    });
    const otherNote = await captureWikiDocument(config, {
      title: "Other Note",
      content: "Other body.",
      type: "note",
    });

    await expect(relateWikiDocuments(config, {
      sourceId: note.id,
      targetId: otherNote.id,
      relation: "unknown_relation",
    })).rejects.toThrow("Invalid relation type: unknown_relation");
    await expect(relateWikiDocuments(config, {
      sourceId: note.id,
      targetId: otherNote.id,
      relation: "source_for",
    })).rejects.toThrow("source_for must originate from a source document");
    await expect(relateWikiDocuments(config, {
      sourceId: source.id,
      targetId: otherNote.id,
      relation: "derived_from",
    })).resolves.toMatchObject({ created: true });
    await linkWikiSourceDocument(config, source.id, note.id);
    await expect(updateWikiDocument(config, {
      id: source.id,
      type: "note",
    })).rejects.toThrow("Update cannot change a source document to another type");
    await expect(updateWikiDocument(config, {
      id: note.id,
      type: "source",
    })).rejects.toThrow("update cannot change a document to type source");
    await expect(updateWikiDocument(config, {
      id: note.id,
      type: "unknown-kind",
    })).rejects.toThrow("Invalid document type: unknown-kind");
  });

  it("lints semantic document types, relation types, and source relation rules", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    await writeFile(
      path.join(config.resolvedWikiPath, "notes", "bad-source-for.md"),
      `---
id: bad-source-for
title: Bad Source For
type: note
status: active
related:
  - id: target-note
    relation: source_for
  - id: target-note
    relation: unknown_relation
---

# Bad Source For
`,
      "utf8",
    );
    await writeFile(
      path.join(config.resolvedWikiPath, "notes", "invalid-type.md"),
      `---
id: invalid-type
title: Invalid Type
type: unknown-kind
status: active
---

# Invalid Type
`,
      "utf8",
    );
    await writeFile(
      path.join(config.resolvedWikiPath, "notes", "target.md"),
      `---
id: target-note
title: Target Note
type: note
status: active
---

# Target Note
`,
      "utf8",
    );

    const result = await lintWikiDocuments(config);

    expect(result.issues).toContainEqual({
      path: "notes/invalid-type.md",
      message: "Invalid document type: unknown-kind",
    });
    expect(result.issues).toContainEqual({
      path: "notes/bad-source-for.md",
      message: "Invalid relation type: unknown_relation",
    });
    expect(result.issues).toContainEqual({
      path: "notes/bad-source-for.md",
      message: "Invalid source relation: source_for must originate from a source document",
    });
  });

  it("keeps historical relation types in code and JSON schemas", async () => {
    const historicalRelations = [
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
    ];
    const relationSchema = JSON.parse(await readFile(path.join(process.cwd(), "schemas", "wiki-relation.schema.json"), "utf8"));
    const relationsIndexSchema = JSON.parse(await readFile(path.join(process.cwd(), "schemas", "wiki-relations-index.schema.json"), "utf8"));

    expect(validWikiRelationTypes).toEqual(expect.arrayContaining(historicalRelations));
    expect(relationSchema.properties.relation.enum).toEqual(expect.arrayContaining(historicalRelations));
    expect(relationsIndexSchema.properties.relations.items.properties.relation.enum).toEqual(expect.arrayContaining(historicalRelations));
  });

  it("syncs Markdown relation links from existing frontmatter relations", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    await writeFile(
      path.join(config.resolvedWikiPath, "notes", "source.md"),
      `---
id: source-note
title: Source Note
type: note
status: active
related:
  - id: target-note
    relation: references
---

# Source Note
`,
      "utf8",
    );
    await writeFile(
      path.join(config.resolvedWikiPath, "notes", "target.md"),
      `---
id: target-note
title: Target Note
type: note
status: active
---

# Target Note
`,
      "utf8",
    );

    const result = await syncWikiRelationLinks(config);
    const source = await getWikiDocumentById(config, "source-note");

    expect(result.documentsChecked).toBeGreaterThanOrEqual(3);
    expect(result.documentsUpdated).toBe(1);
    expect(result.linksCreated).toBe(1);
    expect(source?.content).toContain("## Relations");
    expect(source?.content).toContain("- references: [Target Note](target.md)");
  });

  it("searches wiki documents with metadata filters", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    await writeFile(
      path.join(config.resolvedWikiPath, "implementation", "implement-search.md"),
      `---
id: implementation-search
title: Search Implementation
type: implementation
status: completed
tags:
  - cli
---

# Search Implementation

The librarian can find durable context.
`,
      "utf8",
    );
    await writeFile(
      path.join(config.resolvedWikiPath, ".thoth", "ignored-search.md"),
      `---
id: ignored-search
title: Ignored Search
type: implementation
status: completed
tags:
  - cli
---

durable context
`,
      "utf8",
    );

    const results = await searchWikiDocuments(config, "durable context");
    const typeResults = await searchWikiDocuments(config, "durable", {
      type: "implementation",
    });
    const tagResults = await searchWikiDocuments(config, "durable", { tag: "cli" });
    const noResults = await searchWikiDocuments(config, "durable", { tag: "missing" });

    expect(results.map((result) => result.id)).toEqual(["implementation-search"]);
    expect(typeResults).toHaveLength(1);
    expect(tagResults).toHaveLength(1);
    expect(noResults).toHaveLength(0);
    expect(results[0]?.snippet).toContain("durable context");
  });

  it("rebuilds derived indexes and reports broken relations", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    await writeFile(
      path.join(config.resolvedWikiPath, "projects", "project-index.md"),
      `---
id: project-index
title: Project Index
type: project
status: active
tags:
  - index
related:
  - id: missing-document
    relation: references
---

# Project Index
`,
      "utf8",
    );

    const result = await rebuildWikiIndex(config);
    const index = JSON.parse(
      await readFile(path.join(config.resolvedWikiPath, ".thoth", "index.json"), "utf8"),
    ) as { documents: Array<{ id: string }> };
    const relations = JSON.parse(
      await readFile(
        path.join(config.resolvedWikiPath, ".thoth", "relations.json"),
        "utf8",
      ),
    ) as { relations: Array<{ source: string; target: string; relation: string }> };

    expect(result.documentsIndexed).toBeGreaterThan(0);
    expect(result.relationsIndexed).toBe(1);
    expect(result.warnings).toContain(
      "Broken relation: project-index -> missing-document (references)",
    );
    expect(index.documents.map((document) => document.id)).toContain("project-index");
    expect(relations.relations).toEqual([
      {
        source: "project-index",
        target: "missing-document",
        relation: "references",
      },
    ]);
  });

  it("lints required metadata, duplicate ids, and broken relations", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    await writeFile(
      path.join(config.resolvedWikiPath, "notes", "first.md"),
      `---
id: duplicate-note
title: First Note
type: note
status: active
related:
  - id: missing-note
    relation: references
---

# First Note
`,
      "utf8",
    );
    await writeFile(
      path.join(config.resolvedWikiPath, "notes", "second.md"),
      `---
id: duplicate-note
title: Second Note
type: note
status: active
---

# Second Note
`,
      "utf8",
    );
    await writeFile(
      path.join(config.resolvedWikiPath, "notes", "missing-status.md"),
      `---
id: missing-status
title: Missing Status
type: note
---

# Missing Status
`,
      "utf8",
    );

    const result = await lintWikiDocuments(config);

    expect(result.documentsChecked).toBeGreaterThan(0);
    expect(result.issues).toContainEqual({
      path: "notes/first.md",
      message: "Broken relation: duplicate-note -> missing-note (references)",
    });
    expect(result.issues).toContainEqual({
      path: "notes/first.md",
      message: "Duplicate document id: duplicate-note",
    });
    expect(result.issues).toContainEqual({
      path: "notes/second.md",
      message: "Duplicate document id: duplicate-note",
    });
    expect(result.issues).toContainEqual({
      path: "notes/missing-status.md",
      message: "Missing required frontmatter: status",
    });
  });

  it("diagnoses an initialized wiki", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);
    await initializeWiki(config);

    const result = await runWikiDoctor(config);

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "config", status: "pass" }),
        expect.objectContaining({ name: "wiki", status: "pass" }),
        expect.objectContaining({ name: "structure", status: "pass" }),
        expect.objectContaining({ name: "lint", status: "pass" }),
        expect.objectContaining({ name: "index", status: "pass" }),
      ]),
    );
  });
});

async function createWorkspace(config: { wikiPath: string }): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "thoth-test-"));
  tempDirectories.push(root);

  const workspacePath = path.join(root, "thoth");
  await writeFile(
    path.join(root, ".keep"),
    "",
    "utf8",
  );
  await mkdir(workspacePath, { recursive: true });
  await writeFile(
    path.join(workspacePath, "thoth.config.json"),
    JSON.stringify(config),
    "utf8",
  );

  return workspacePath;
}
