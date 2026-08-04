import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import type { ResolvedThothConfig } from "../core/index.js";
import { ensureDirectory, pathExists } from "../storage/index.js";

export type AgentRuntime = "opencode" | "prompt" | "external";
export type AgentSource = "internal" | "external";

export type AgentRegistryEntry = {
  id: string;
  path: string;
  runtime: AgentRuntime;
  category: string;
  status: string;
  source: AgentSource;
  when_to_use?: string;
};

export type AgentValidationIssue = {
  id: string;
  path: string;
  message: string;
};

export type AgentValidationResult = {
  agentsChecked: number;
  issues: AgentValidationIssue[];
};

type AgentRegistryFile = {
  version: number;
  agents: AgentRegistryEntry[];
};

const registryVersion = 1;

export async function listAgents(
  config: ResolvedThothConfig,
  filters: { source?: AgentSource; category?: string } = {},
): Promise<AgentRegistryEntry[]> {
  const agents = await loadAllAgents(config);

  return agents
    .filter((agent) => !filters.source || agent.source === filters.source)
    .filter((agent) => !filters.category || agent.category === filters.category)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export async function getAgent(
  config: ResolvedThothConfig,
  id: string,
): Promise<AgentRegistryEntry | undefined> {
  return (await loadAllAgents(config)).find((agent) => agent.id === id);
}

export async function registerExternalAgent(
  config: ResolvedThothConfig,
  agentPath: string,
): Promise<AgentRegistryEntry> {
  const resolvedPath = path.resolve(agentPath);
  const markdown = await readFile(resolvedPath, "utf8");
  const parsed = matter(markdown);
  const frontmatter = parsed.data as Record<string, unknown>;
  const id = readString(frontmatter.id)
    ?? readString(frontmatter.name)
    ?? path.basename(resolvedPath, ".md");
  const entry: AgentRegistryEntry = {
    id,
    path: resolvedPath,
    runtime: readRuntime(frontmatter.runtime) ?? "external",
    category: readString(frontmatter.category) ?? "external",
    status: readString(frontmatter.status) ?? "external",
    source: "external",
    when_to_use: readString(frontmatter.when_to_use) ?? readString(frontmatter.description),
  };
  const registry = await loadExternalRegistry(config);
  const withoutExisting = registry.agents.filter((agent) => agent.id !== entry.id);

  await saveExternalRegistry(config, {
    version: registryVersion,
    agents: [...withoutExisting, entry].sort((left, right) => left.id.localeCompare(right.id)),
  });

  return entry;
}

export async function unregisterExternalAgent(
  config: ResolvedThothConfig,
  id: string,
): Promise<boolean> {
  const registry = await loadExternalRegistry(config);
  const agents = registry.agents.filter((agent) => agent.id !== id);
  const removed = agents.length !== registry.agents.length;

  if (removed) {
    await saveExternalRegistry(config, { version: registryVersion, agents });
  }

  return removed;
}

export async function validateAgents(
  config: ResolvedThothConfig,
): Promise<AgentValidationResult> {
  const agents = await loadAllAgents(config);
  const issues: AgentValidationIssue[] = [];
  const ids = new Set<string>();

  for (const agent of agents) {
    if (ids.has(agent.id)) {
      issues.push({ id: agent.id, path: agent.path, message: "Duplicate agent id" });
    }

    ids.add(agent.id);

    const resolvedPath = resolveAgentPath(agent);
    if (!(await pathExists(resolvedPath))) {
      issues.push({ id: agent.id, path: agent.path, message: "Agent file not found" });
      continue;
    }

    const markdown = await readFile(resolvedPath, "utf8");
    const parsed = matter(markdown);

    if (!parsed.content.trim()) {
      issues.push({ id: agent.id, path: agent.path, message: "Agent body is empty" });
    }
  }

  return { agentsChecked: agents.length, issues };
}

async function loadAllAgents(config: ResolvedThothConfig): Promise<AgentRegistryEntry[]> {
  const [internal, external] = await Promise.all([
    loadInternalRegistry(),
    loadExternalRegistry(config),
  ]);

  return [...internal.agents, ...external.agents];
}

async function loadInternalRegistry(): Promise<AgentRegistryFile> {
  const registryPath = path.join(packageRootPath(), "agents", "registry.json");
  const raw = await readFile(registryPath, "utf8");

  return JSON.parse(raw) as AgentRegistryFile;
}

async function loadExternalRegistry(config: ResolvedThothConfig): Promise<AgentRegistryFile> {
  const registryPath = externalRegistryPath(config);

  if (!(await pathExists(registryPath))) {
    return { version: registryVersion, agents: [] };
  }

  const raw = await readFile(registryPath, "utf8");

  return JSON.parse(raw) as AgentRegistryFile;
}

async function saveExternalRegistry(
  config: ResolvedThothConfig,
  registry: AgentRegistryFile,
): Promise<void> {
  const registryPath = externalRegistryPath(config);

  await ensureDirectory(path.dirname(registryPath));
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

function externalRegistryPath(config: ResolvedThothConfig): string {
  return path.join(config.workspacePath, ".thoth", "agents.json");
}

function packageRootPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function resolveAgentPath(agent: AgentRegistryEntry): string {
  if (path.isAbsolute(agent.path)) {
    return agent.path;
  }

  return path.join(packageRootPath(), agent.path);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readRuntime(value: unknown): AgentRuntime | undefined {
  if (value === "opencode" || value === "prompt" || value === "external") {
    return value;
  }

  return undefined;
}
