import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { z } from "zod/v4";

export type ThothConfig = {
  wikiPath: string;
  defaultType: string;
  defaultStatus: string;
  dateFormat: string;
  audit?: AuditConfig;
};

export type AuditConfig = {
  enabled?: boolean;
  path?: string;
  actor?: string;
  maxEntryBytes?: number;
  maxStringLength?: number;
  redactKeys?: string[];
};

export const supportedDateFormats = [
  "YYYY-MM-DD",
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "YYYY/MM/DD",
] as const;
export type DateFormat = (typeof supportedDateFormats)[number];

export type ResolvedThothConfig = ThothConfig & {
  workspacePath: string;
  configPath: string;
  resolvedWikiPath: string;
};
export const configMutationKeys = ["defaultType", "defaultStatus", "dateFormat"] as const;
export type ConfigMutationKey = (typeof configMutationKeys)[number];
export type ConfigMutation = Partial<Record<ConfigMutationKey, string>>;
const auditSchema = z.object({ enabled: z.boolean().optional(), path: z.string().min(1).optional(), actor: z.string().min(1).optional(), maxEntryBytes: z.number().int().min(256).max(1048576).optional(), maxStringLength: z.number().int().min(32).max(10000).optional(), redactKeys: z.array(z.string()).optional() }).strict();
const completeConfigSchema = z.object({ wikiPath: z.string().min(1).optional(), defaultType: z.string().min(1).optional(), defaultStatus: z.string().min(1).optional(), dateFormat: z.enum(supportedDateFormats).optional(), audit: auditSchema.optional() }).strict();

const defaultConfig: ThothConfig = {
  wikiPath: "wiki",
  defaultType: "note",
  defaultStatus: "draft",
  dateFormat: "YYYY-MM-DD",
  audit: { enabled: true },
};

export function resolveDateFormat(value: unknown): DateFormat {
  return typeof value === "string" && (supportedDateFormats as readonly string[]).includes(value)
    ? value as DateFormat
    : defaultConfig.dateFormat as DateFormat;
}

export async function loadConfig(
  workspacePath?: string,
): Promise<ResolvedThothConfig> {
  const configPath = await resolveConfigPath(workspacePath);
  const resolvedWorkspacePath = path.dirname(configPath);
  const rawConfig = await readFile(configPath, "utf8");
  const parsedConfig = parseConfigSource(rawConfig);
  const config: ThothConfig = { ...defaultConfig, ...parsedConfig, audit: { ...defaultConfig.audit, ...(parsedConfig.audit ?? {}) }, dateFormat: resolveDateFormat(parsedConfig.dateFormat) };

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

export async function readConfigSnapshot(config: ResolvedThothConfig): Promise<{ raw: Record<string, unknown>; effective: ThothConfig; hash: string }> {
  const source = await readFile(config.configPath, "utf8");
  const raw = parseConfigSource(source);
  const effective = { ...defaultConfig, ...raw, audit: { ...defaultConfig.audit, ...((raw.audit ?? {}) as object) } } as ThothConfig;
  return { raw, effective, hash: createHash("sha256").update(source).digest("hex") };
}

function parseConfigSource(source: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch (error) { throw new Error(`Invalid thoth.config.json: ${error instanceof Error ? error.message : String(error)}`); }
  const checked = completeConfigSchema.safeParse(parsed);
  if (!checked.success) throw new Error(`Invalid thoth.config.json: ${checked.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(", ")}`);
  return checked.data as Record<string, unknown>;
}

export function configConfirmationToken(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)]));
  return value;
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
