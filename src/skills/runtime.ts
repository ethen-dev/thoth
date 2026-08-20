import { lintWikiDocuments, searchWikiDocuments } from "../actions/wiki.js";
import { executePlan, planIntent } from "../core/runtime.js";
import { createHash } from "node:crypto";
import { getSkill } from "./registry.js";
import type { SkillProviderAdapter, SkillProviderRequest, SkillResult, SkillRuntimeConfig, SkillInvocation } from "./types.js";
import { z } from "zod/v4";
import { recordAudit } from "../audit/index.js";

const emptyFilter = z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional());
const querySchema = z.object({ query: z.string().trim().min(1).max(500), type: emptyFilter, status: emptyFilter, tag: emptyFilter, limit: z.number().int().min(1).max(20).default(20) }).strict();
const lintSchema = z.object({}).strict();
const invocationSchema = z.object({
  skillId: z.string().min(1),
  mode: z.enum(["validate", "plan", "dry-run", "execute"]),
  input: z.record(z.string(), z.unknown()).optional(),
  confirmed: z.boolean().optional(),
  confirmationToken: z.string().min(1).optional(),
}).strict();
const queryInput = (value: unknown) => querySchema.parse(value);
const llmSkills = new Set(["wiki-ingest", "wiki-crystallize", "wiki-integrate", "wiki-config"]);
const skillActions: Record<string, Set<string>> = {
  "wiki-ingest": new Set(["capture", "update"]),
  "wiki-crystallize": new Set(["capture", "update", "append"]),
  "wiki-integrate": new Set(["update", "append"]),
  "wiki-config": new Set(),
};
const nonAtomicActions = new Set(["relate", "source_link", "log", "index"]);
const proposalSchema = z.object({
  version: z.literal(1),
  summary: z.string().min(1).max(2000),
  actions: z.array(z.object({
    intent: z.enum(["capture", "update", "append", "source_add", "relate", "log", "index", "source_link"]),
    input: z.record(z.string(), z.unknown()),
  }).strict()).min(1).max(1),
}).strict();

export async function runSkill(config: SkillRuntimeConfig, invocation: SkillInvocation, provider?: SkillProviderAdapter): Promise<SkillResult> {
  const started = Date.now();
  const checked = invocationSchema.safeParse(invocation);
  const result = checked.success
    ? await runSkillInternal(config, checked.data, provider)
    : failure(invalidInvocationSkillId(invocation), invalidInvocationCode(invocation), invalidInvocationMessage(invocation, checked.error), invalidInvocationMode(invocation));
  await recordAudit(config, { operation: `skill.${invocation?.skillId ?? "unknown"}.${invocation?.mode ?? "error"}`, surface: "skill", actor: config.audit?.actor ?? "system", result: result.ok ? (invocation.mode === "plan" ? "planned" : invocation.mode === "execute" && !result.readOnly ? "executed" : "proposed") : (result.error?.code === "confirmation_required" ? "proposed" : "error"), affectedIds: invocation?.skillId ? [invocation.skillId] : [], durationMs: Date.now() - started, error: result.error ? { code: result.error.code, message: result.error.message } : undefined });
  return result;
}

async function runSkillInternal(config: SkillRuntimeConfig, invocation: SkillInvocation, provider?: SkillProviderAdapter): Promise<SkillResult> {
  let skill;
  try {
    skill = await getSkill(config, invocation.skillId);
  } catch (error) {
    return failure(invocation.skillId, "discovery_error", errorMessage(error));
  }
  if (!skill) return failure(invocation.skillId, "not_found", `Skill not found: ${invocation.skillId}`);
  try {
    if (skill.id === "wiki-query") queryInput(invocation.input);
    else if (skill.id === "wiki-lint") lintSchema.parse(invocation.input ?? {});
    else if (llmSkills.has(skill.id)) return runLlmSkill(config, skill.id, skill.version, skill.body, invocation, provider);
    else if (invocation.mode === "execute") return failure(skill.id, "unsupported", "Skill has no allowlisted read-only handler");
    if (invocation.mode === "validate") return { ok: true, skillId: skill.id, mode: "validate", readOnly: true, status: "validated", data: { valid: true } };
    if (skill.id === "wiki-query") {
      const input = queryInput(invocation.input);
      const results = await searchWikiDocuments(config, input.query, input);
      return { ok: true, skillId: skill.id, mode: "execute", readOnly: true, status: "executed", data: { results: results.map((result) => ({
        id: result.id,
        title: result.title,
        type: result.type,
        status: result.status,
        tags: result.tags,
        path: result.path,
        snippet: normalizeSnippet(result.snippet),
      })) } };
    }
    if (skill.id === "wiki-lint") return { ok: true, skillId: skill.id, mode: "execute", readOnly: true, status: "executed", data: await lintWikiDocuments(config) };
    return failure(skill.id, "unsupported", "Skill is read-only-only until an explicit handler is added");
  } catch (error) {
    return failure(skill.id, error instanceof z.ZodError ? "invalid_input" : "execution_error", errorMessage(error));
  }
}

function failure(skillId: string, code: string, message: string, mode: SkillInvocation["mode"] = "execute"): SkillResult {
  return { ok: false, skillId, mode, readOnly: code !== "executed", status: code === "unsupported" || code === "provider_required" ? "unsupported" : "error", error: { code, message } };
}

async function runLlmSkill(config: SkillRuntimeConfig, skillId: string, version: string, documentation: string, invocation: SkillInvocation, provider?: SkillProviderAdapter): Promise<SkillResult> {
  if (skillId === "wiki-config") return failure(skillId, "unsupported", "wiki-config has no safe document mutation handler", invocation.mode);
  if (!provider) return failure(skillId, "provider_required", "An injected SkillProviderAdapter is required for LLM skills", invocation.mode);
  let proposal: z.infer<typeof proposalSchema>;
  try {
    const request: SkillProviderRequest = { skillId, input: invocation.input ?? {}, mode: invocation.mode === "validate" ? "plan" : invocation.mode, documentation };
    const raw = await provider.complete(request);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const checked = proposalSchema.safeParse(parsed);
    if (!checked.success) return failure(skillId, "invalid_proposal", "Provider proposal does not match the skill proposal schema", invocation.mode);
    proposal = checked.data;
  } catch (error) {
    return failure(skillId, "invalid_proposal", errorMessage(error), invocation.mode);
  }
  const action = proposal.actions[0];
  if (nonAtomicActions.has(action.intent)) return failure(skillId, "non_atomic_action", `Action ${action.intent} is not available from a skill`, invocation.mode);
  if (!skillActions[skillId]?.has(action.intent)) return failure(skillId, "skill_action_not_allowed", `Action ${action.intent} is not allowed for ${skillId}`, invocation.mode);
  const planned = planIntent(config, { intent: action.intent, input: action.input });
  if (planned.status === "error") return failure(skillId, planned.error?.code ?? "invalid_proposal", planned.error?.message ?? "Proposal rejected", invocation.mode);
  if (invocation.mode === "validate" || invocation.mode === "plan" || invocation.mode === "dry-run") {
    return { ok: true, skillId, mode: invocation.mode, readOnly: true, status: "validated", data: { proposal, plan: planned, confirmationToken: proposalToken(skillId, version, planned, invocation.input, proposal), ...(invocation.mode === "dry-run" ? { dryRun: true } : {}) } };
  }
  const token = proposalToken(skillId, version, planned, invocation.input, proposal);
  if (!invocation.confirmed) return { ok: true, skillId, mode: "execute", readOnly: true, status: "error", data: { proposal, plan: planned, confirmationToken: token }, error: { code: "confirmation_required", message: "Confirmation is required before executing a mutation" } };
  if (!invocation.confirmationToken) return failure(skillId, "confirmation_token_required", "confirmed=true requires the exact confirmationToken", invocation.mode);
  if (invocation.confirmationToken !== token) return failure(skillId, "confirmation_mismatch", "The confirmationToken does not match the reviewed proposal", invocation.mode);
  const result = await executePlan(config, planned, { confirmed: true });
  return { ok: result.ok, skillId, mode: "execute", readOnly: false, status: result.ok ? "executed" : "error", data: result, error: result.error };
}

function proposalToken(skillId: string, version: string, plan: unknown, input: unknown, proposal: unknown): string {
  const normalized = stable({ skillId, version, plan, input: input ?? {}, proposal });
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, stable(entry)]));
  return value;
}

function normalizeSnippet(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function invalidInvocationSkillId(value: unknown): string {
  return value && typeof value === "object" && typeof (value as Record<string, unknown>).skillId === "string" ? (value as Record<string, unknown>).skillId as string : "";
}

function invalidInvocationMode(value: unknown): SkillInvocation["mode"] {
  return value && typeof value === "object" && ["validate", "plan", "dry-run", "execute"].includes((value as Record<string, unknown>).mode as string)
    ? (value as Record<string, unknown>).mode as SkillInvocation["mode"]
    : "execute";
}

function invalidInvocationCode(value: unknown): string {
  return value && typeof value === "object" && !["validate", "plan", "dry-run", "execute"].includes((value as Record<string, unknown>).mode as string) ? "invalid_mode" : "invalid_input";
}

function invalidInvocationMessage(value: unknown, error: z.ZodError): string {
  if (invalidInvocationCode(value) === "invalid_mode") return "mode must be validate, plan, dry-run or execute";
  return `Invalid skill invocation: ${error.issues.map((issue) => issue.path.join(".") + " " + issue.message).join(", ")}`;
}
