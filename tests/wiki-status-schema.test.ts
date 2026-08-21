import { readFile } from "node:fs/promises";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

describe("wiki status schema contract", () => {
  it("accepts a valid status with document and relation counts", async () => {
    const schema = JSON.parse(await readFile(path.resolve("schemas/wiki-status.schema.json"), "utf8"));
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    const status = {
      workspacePath: "/workspace",
      configPath: "/workspace/thoth.config.json",
      wikiPath: "/workspace/wiki",
      wikiExists: true,
      indexExists: true,
      missingDirectories: [],
      available: true,
      version: "0.6.0",
      indexMd: { exists: true, valid: true },
      technicalIndex: { exists: true, valid: true, documents: 3 },
      relationsIndex: { exists: true, valid: true, relations: 2 },
      documentCount: 3,
      relationCount: 2,
      audit: { enabled: true, exists: true, valid: true, entries: 4 },
    };

    expect(validate(status), JSON.stringify(validate.errors)).toBe(true);
  });
});
