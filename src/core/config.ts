import { readFile } from "node:fs/promises";
import os from "node:os";
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
  workspacePath?: string,
): Promise<ResolvedThothConfig> {
  const configPath = await resolveConfigPath(workspacePath);
  const resolvedWorkspacePath = path.dirname(configPath);
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

async function resolveConfigPath(workspacePath?: string): Promise<string> {
  const candidates = workspacePath
    ? [path.join(path.resolve(workspacePath), "thoth.config.json")]
    : [
        process.env.THOTH_CONFIG ? path.resolve(process.env.THOTH_CONFIG) : undefined,
        path.join(process.cwd(), "thoth.config.json"),
        path.join(os.homedir(), "Documents", "Thoth", "workspace", "thoth.config.json"),
      ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new Error(
    "Cannot find thoth.config.json. Run from a T.H.O.T.H. workspace, set THOTH_CONFIG, or install the default workspace at ~/Documents/Thoth/workspace.",
  );
}

export function createDefaultConfig(wikiPath = "wiki"): ThothConfig {
  return {
    ...defaultConfig,
    wikiPath,
  };
}
