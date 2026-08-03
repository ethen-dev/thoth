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
  searchWikiDocuments,
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
