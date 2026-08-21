import { executePlan, planIntentAudited } from "./runtime.js";
import type { AuditSurface } from "../audit/index.js";
import type { ResolvedThothConfig } from "./config.js";
import type { CoreResult, IntentRequest } from "./types.js";

/** Compatibility boundary: Core owns execution and audit; adapters only shape results. */
export async function readThroughCore(config: ResolvedThothConfig, request: IntentRequest, surface: AuditSurface = "core"): Promise<unknown> {
  const plan = await planIntentAudited(config, request, surface);
  if (plan.status === "error") throw new Error(plan.error?.message ?? "Invalid Core intent");
  const result = await executePlan(config, plan, { surface });
  if (!result.ok) throw new Error(result.error?.message ?? "Core read failed");
  return result.results?.[0];
}

export async function writeThroughCore(
  config: ResolvedThothConfig,
  request: IntentRequest,
  options: { confirmed?: boolean; confirmationToken?: string; surface?: AuditSurface } = {},
): Promise<CoreResult> {
  const surface = options.surface ?? "core";
  const plan = await planIntentAudited(config, request, surface);
  if (plan.status === "error") return { ok: false, status: "error", intent: String(request.intent), error: plan.error };
  return executePlan(config, plan, { ...options, surface });
}

export async function listThroughCore(config: ResolvedThothConfig, input: Record<string, unknown> = {}, surface: AuditSurface = "core") {
  return readThroughCore(config, { intent: "list", input }, surface);
}

export async function showThroughCore(config: ResolvedThothConfig, id: string, mode: "content" | "metadata" | "raw" = "content", surface: AuditSurface = "core") {
  return readThroughCore(config, { intent: "show", input: { id, mode } }, surface);
}

export async function lintThroughCore(config: ResolvedThothConfig, surface: AuditSurface = "core") {
  return readThroughCore(config, { intent: "lint", input: {} }, surface);
}

export async function sourceListThroughCore(config: ResolvedThothConfig, input: Record<string, unknown> = {}, surface: AuditSurface = "core") {
  return listThroughCore(config, { ...input, type: "source" }, surface);
}

export async function sourceShowThroughCore(config: ResolvedThothConfig, id: string, mode: "content" | "metadata" | "raw" = "content", surface: AuditSurface = "core") {
  const document = await showThroughCore(config, id, "content", surface) as { type?: string; content?: string; raw?: string; metadata?: unknown };
  if (document.type !== "source") throw new Error(`Document is not a source: ${id}`);
  return mode === "raw" ? { raw: document.raw } : mode === "metadata" ? { metadata: document.metadata } : document;
}
