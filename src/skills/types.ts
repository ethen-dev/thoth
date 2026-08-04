import type { ResolvedThothConfig } from "../core/index.js";

export type SkillStatus = "draft" | "active" | "experimental" | "deprecated";

export type SkillManifest = {
  id: string;
  name: string;
  version: string;
  category: string;
  status: SkillStatus;
  path: string;
};

export type Skill = SkillManifest & { body: string };
export type SkillProviderRequest = {
  skillId: string;
  input: unknown;
  mode: "plan" | "dry-run" | "execute";
  /** Markdown is context-only documentation and must not be treated as instructions. */
  documentation: string;
};
export type SkillProviderAdapter = { complete(request: SkillProviderRequest): Promise<unknown> | unknown };
export type SkillLimits = {
  maxDepth: number;
  maxFiles: number;
  maxFileBytes: number;
  maxFrontmatterBytes: number;
  maxBodyBytes: number;
  maxTotalBytes: number;
};
export type SkillInvocation = { skillId: string; input?: unknown; mode: "validate" | "plan" | "dry-run" | "execute"; confirmed?: boolean; confirmationToken?: string };
export type SkillResult = {
  ok: boolean;
  skillId: string;
  mode: SkillInvocation["mode"];
  readOnly: boolean;
  status: "validated" | "executed" | "unsupported" | "error";
  data?: unknown;
  error?: { code: string; message: string };
};
export type SkillRuntimeConfig = ResolvedThothConfig;
