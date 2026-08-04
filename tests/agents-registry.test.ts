import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getAgent,
  listAgents,
  registerExternalAgent,
  unregisterExternalAgent,
  validateAgents,
} from "../src/agents/index.js";
import { loadConfig } from "../src/core/index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("agent registry", () => {
  it("lists and shows internal OpenCode agents", async () => {
    const config = await createWorkspace();
    const agents = await listAgents(config);
    const developmentAgents = await listAgents(config, { category: "development" });
    const memoryAgent = await getAgent(config, "thoth-memory");

    expect(agents.map((agent) => agent.id)).toContain("thoth-memory");
    expect(agents.map((agent) => agent.id)).toContain("thoth-dev-reviewer");
    expect(developmentAgents.map((agent) => agent.id)).toContain("thoth-dev-router");
    expect(memoryAgent?.runtime).toBe("opencode");
  });

  it("registers, validates, and unregisters external agents", async () => {
    const config = await createWorkspace();
    const externalAgentPath = path.join(config.workspacePath, "my-agent.md");
    await writeFile(
      externalAgentPath,
      `---
id: my-agent
category: custom
status: active
runtime: opencode
when_to_use: Custom user workflow.
---

# My Agent

Use this for custom work.
`,
      "utf8",
    );

    const registered = await registerExternalAgent(config, externalAgentPath);
    const externalAgents = await listAgents(config, { source: "external" });
    const validation = await validateAgents(config);
    const removed = await unregisterExternalAgent(config, "my-agent");

    expect(registered.id).toBe("my-agent");
    expect(externalAgents).toHaveLength(1);
    expect(externalAgents[0]?.path).toBe(externalAgentPath);
    expect(validation.issues).toEqual([]);
    expect(removed).toBe(true);
    expect(await listAgents(config, { source: "external" })).toEqual([]);
  });
});

async function createWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "thoth-agents-test-"));
  tempDirectories.push(root);

  const workspacePath = path.join(root, "workspace");
  await mkdir(workspacePath, { recursive: true });
  await writeFile(
    path.join(workspacePath, "thoth.config.json"),
    JSON.stringify({ wikiPath: "../wiki" }),
    "utf8",
  );

  return loadConfig(workspacePath);
}
