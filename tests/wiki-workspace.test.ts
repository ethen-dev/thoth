import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/core/index.js";
import {
  captureWikiDocument,
  getWikiDocumentById,
  getWikiStatus,
  initializeWiki,
  listWikiDocuments,
  lintWikiDocuments,
  rebuildWikiIndex,
  searchWikiDocuments,
  updateWikiDocument,
} from "../src/wiki/index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
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

  it("initializes the configured wiki without overwriting an existing index", async () => {
    const workspacePath = await createWorkspace({ wikiPath: "../wiki" });
    const config = await loadConfig(workspacePath);

    const firstInit = await initializeWiki(config);
    expect(firstInit.index).toBe("created");
    expect(firstInit.missingDirectories).toEqual([]);

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
