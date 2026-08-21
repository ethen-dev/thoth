import type { ResolvedThothConfig } from "./config.js";

export const coreIntents = ["query", "list", "show", "status", "doctor", "init", "capture", "update", "append", "relate", "sync_links", "log", "index", "lint", "source_add", "source_link", "clarify", "ignore"] as const;
export type CoreIntent = (typeof coreIntents)[number];
export const maxCorePlanSteps = 20;

export type IntentRequest = {
  intent: CoreIntent | string;
  input?: unknown;
  action?: string;
};

export type CoreAction =
  | "skill.wiki-query" | "wiki.list" | "wiki.show" | "wiki.status" | "wiki.doctor" | "wiki.lint"
   | "wiki.init" | "wiki.index" | "wiki.capture" | "wiki.update" | "wiki.append"
   | "wiki.relate" | "wiki.sync-links" | "wiki.log" | "wiki.source.add" | "wiki.source.link";

export type PlanStep = {
  id: string;
  action: CoreAction | string;
  input: unknown;
  write: boolean;
  summary: string;
};

export type CoreErrorCode = "invalid_input" | "plan_too_large" | "not_allowlisted" | "confirmation_required" | "non_atomic_plan" | "non_atomic_action" | "execution_error";
export type CoreError = { code: CoreErrorCode; message: string; details?: unknown };

export type ThothPlan = {
  version: 1;
  intent: string;
  steps: PlanStep[];
  confirmationRequired: boolean;
  confirmationToken?: string;
  status: "planned" | "error";
  error?: CoreError;
};

export type CoreResult = {
  ok: boolean;
  status: "executed" | "proposal" | "error";
  intent: string;
  results?: unknown[];
  plan?: ThothPlan;
  error?: CoreError;
};

export type CoreConfig = ResolvedThothConfig;
