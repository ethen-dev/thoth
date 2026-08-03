import { readFile } from "node:fs/promises";
import path from "node:path";

export type ThothConfig = {
  wikiPath: string;
  defaultType: string;
  defaultStatus: string;
  dateFormat: string;
};

export type ResolvedThothConfig = ThothConfig & {
  workspacePath: string;
  configPath: string;
  resolvedWikiPath: string;
};

const defaultConfig: ThothConfig = {
  wikiPath: "wiki",
  defaultType: "note",
  defaultStatus: "draft",
  dateFormat: "YYYY-MM-DD",
};

export async function loadConfig(
  workspacePath = process.cwd(),
): Promise<ResolvedThothConfig> {
  const resolvedWorkspacePath = path.resolve(workspacePath);
  const configPath = path.join(resolvedWorkspacePath, "thoth.config.json");
  const rawConfig = await readFile(configPath, "utf8");
  const parsedConfig = JSON.parse(rawConfig) as Partial<ThothConfig>;
  const config = { ...defaultConfig, ...parsedConfig };

  if (!config.wikiPath || typeof config.wikiPath !== "string") {
    throw new Error("Invalid thoth.config.json: wikiPath must be a string.");
  }

  return {
    ...config,
    workspacePath: resolvedWorkspacePath,
    configPath,
    resolvedWikiPath: path.resolve(resolvedWorkspacePath, config.wikiPath),
  };
}

export function createDefaultConfig(wikiPath = "wiki"): ThothConfig {
  return {
    ...defaultConfig,
    wikiPath,
  };
}
