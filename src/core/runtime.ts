import { z } from "zod/v4";
import {
  addWikiSourceDocument, appendLogEntry, appendWikiDocument, captureWikiDocument,
  getWikiDocumentById, listWikiDocuments, lintWikiDocuments, relateWikiDocuments,
  rebuildWikiIndex, updateWikiDocument, linkWikiSourceDocument,
} from "../actions/index.js";
import { runSkill } from "../skills/runtime.js";
import type { ResolvedThothConfig } from "./config.js";
import { coreIntents, maxCorePlanSteps, type CoreAction, type CoreError, type CoreResult, type IntentRequest, type PlanStep, type ThothPlan } from "./types.js";

const limits = { candidates: 20 } as const;
const intentActions: Record<string, CoreAction> = {
  query: "skill.wiki-query", list: "wiki.list", show: "wiki.show", lint: "wiki.lint", index: "wiki.index",
  capture: "wiki.capture", update: "wiki.update", append: "wiki.append", relate: "wiki.relate", log: "wiki.log",
  source_add: "wiki.source.add", source_link: "wiki.source.link",
};
const writeActions = new Set<CoreAction>(["wiki.index", "wiki.capture", "wiki.update", "wiki.append", "wiki.relate", "wiki.log", "wiki.source.add", "wiki.source.link"]);
const nonAtomicActions = new Set<CoreAction>(["wiki.index", "wiki.relate"]);
const actionSet = new Set<CoreAction>([...Object.values(intentActions), ...writeActions]);
const emptyFilter = z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional());

export function planIntent(_config: ResolvedThothConfig, request: IntentRequest): ThothPlan {
  const intent = request?.intent;
  const base = { version: 1 as const, intent: String(intent ?? ""), steps: [], confirmationRequired: false, status: "planned" as const };
  if (typeof intent !== "string" || !coreIntents.includes(intent as never) || intent === "clarify" || intent === "ignore") {
    return { ...base, status: "error", error: coreError("not_allowlisted", `Intent is not allowlisted: ${String(intent)}`) };
  }
  const expected = intentActions[intent];
  if (!expected || request.action !== undefined && request.action !== expected) {
    return { ...base, status: "error", error: coreError("not_allowlisted", `Action ${String(request.action)} is not allowlisted for intent ${intent}`) };
  }
  if (nonAtomicActions.has(expected)) return { ...base, status: "error", error: coreError("non_atomic_action", `Action ${expected} is not available without a transaction`) };
  const input = validateStepInput(intent, request.input, expected);
  if (input.error) return { ...base, status: "error", error: input.error };
  const step: PlanStep = { id: "step-1", action: expected, input: input.value, write: writeActions.has(expected), summary: intent === "query" ? "Progressive wiki retrieval (summaries only)" : `${intent} through the local wiki handler` };
  return { ...base, steps: [step], confirmationRequired: step.write };
}

/** Validates the complete untrusted plan before reading any step fields. */
export async function executePlan(config: ResolvedThothConfig, candidate: unknown, options: { confirmed?: boolean } = {}): Promise<CoreResult> {
  const checked = validatePlan(candidate);
  if (!checked.ok) return { ok: false, status: "error", intent: checked.intent, error: checked.error };
  const plan = checked.plan;
  const writes = plan.steps.filter((step) => step.write);
  if (writes.length > 1) return { ok: false, status: "error", intent: plan.intent, error: coreError("non_atomic_plan", "Plans with more than one write are not supported") };
  if (plan.confirmationRequired !== (writes.length > 0)) return { ok: false, status: "error", intent: plan.intent, error: coreError("invalid_input", "confirmationRequired does not match plan writes") };
  if (writes.length > 0 && !options.confirmed) return { ok: true, status: "proposal", intent: plan.intent, plan, error: coreError("confirmation_required", "Confirmation is required before writing") };
  try {
    const results: unknown[] = [];
    for (const step of plan.steps) results.push(await executeStep(config, step));
    return { ok: true, status: "executed", intent: plan.intent, results };
  } catch (cause) {
    return { ok: false, status: "error", intent: plan.intent, error: coreError("execution_error", cause instanceof Error ? cause.message : String(cause)) };
  }
}

function validatePlan(candidate: unknown): { ok: true; plan: ThothPlan } | { ok: false; intent: string; error: CoreError } {
  const schema = z.object({
    version: z.literal(1), intent: z.string().min(1), steps: z.array(z.object({ id: z.string().min(1), action: z.string().min(1), input: z.unknown(), write: z.boolean(), summary: z.string() }).strict()).min(1).max(maxCorePlanSteps),
    confirmationRequired: z.boolean(), status: z.literal("planned"), error: z.never().optional(),
  }).strict();
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    const tooLarge = parsed.error.issues.some((issue) => issue.path[0] === "steps" && issue.code === "too_big");
    return { ok: false, intent: "", error: coreError(tooLarge ? "plan_too_large" : "invalid_input", tooLarge ? `Core plans may contain at most ${maxCorePlanSteps} steps` : "Malformed Core plan", parsed.error.issues) };
  }
  const intent = parsed.data.intent;
  if (parsed.data.steps.length > maxCorePlanSteps) return { ok: false, intent, error: coreError("plan_too_large", `Core plans may contain at most ${maxCorePlanSteps} steps`) };
  const expected = intentActions[intent];
  if (!expected || !coreIntents.includes(intent as never)) return { ok: false, intent, error: coreError("not_allowlisted", `Intent is not allowlisted: ${intent}`) };
  for (const step of parsed.data.steps) {
    if (step.action !== expected || !actionSet.has(step.action as CoreAction)) return { ok: false, intent, error: coreError("not_allowlisted", `Action ${step.action} is not allowlisted for intent ${intent}`) };
    if (step.write !== writeActions.has(step.action as CoreAction)) return { ok: false, intent, error: coreError("invalid_input", "Plan write flags do not match its allowlist") };
    if (nonAtomicActions.has(step.action as CoreAction)) return { ok: false, intent, error: coreError("non_atomic_action", `Action ${step.action} is not available without a transaction`) };
    const input = validateStepInput(intent, step.input, step.action as CoreAction);
    if (input.error) return { ok: false, intent, error: input.error };
  }
  return { ok: true, plan: parsed.data as ThothPlan };
}

async function executeStep(config: ResolvedThothConfig, step: PlanStep): Promise<unknown> {
  const input = step.input as Record<string, unknown>;
  switch (step.action) {
    case "skill.wiki-query": { const result = await runSkill(config, { skillId: "wiki-query", mode: "execute", input }); if (!result.ok) throw new Error(result.error?.message ?? "Query failed"); const data = result.data as { results?: unknown[] }; return { ...data, results: (data.results ?? []).slice(0, limits.candidates) }; }
    case "wiki.list": return listWikiDocuments(config, input);
    case "wiki.show": { const doc = await getWikiDocumentById(config, String(input.id)); if (!doc) throw new Error(`Document not found: ${input.id}`); return input.mode === "raw" ? { raw: doc.raw } : input.mode === "metadata" ? { metadata: doc.metadata } : doc; }
    case "wiki.lint": return lintWikiDocuments(config);
    case "wiki.index": return rebuildWikiIndex(config);
    case "wiki.capture": return captureWikiDocument(config, input as never);
    case "wiki.update": return updateWikiDocument(config, input as never);
    case "wiki.append": return appendWikiDocument(config, input as never);
    case "wiki.relate": return relateWikiDocuments(config, input as never);
    case "wiki.log": return appendLogEntry(config, { ...input, projectId: input.projectId as string | undefined } as never);
    case "wiki.source.add": return addWikiSourceDocument(config, input as never);
    case "wiki.source.link": return linkWikiSourceDocument(config, String(input.sourceId), String(input.targetId));
    default: throw new Error(`Action is not allowlisted: ${step.action}`);
  }
}

function validateStepInput(intent: string, value: unknown, action: CoreAction): { value?: unknown; error?: CoreError } {
  const schemas: Record<string, z.ZodType> = {
    query: z.object({ query: z.string().trim().min(1).max(500), type: emptyFilter, status: emptyFilter, tag: emptyFilter, limit: z.number().int().min(1).max(20).default(20) }).strict(),
    list: z.object({ type: z.string().optional(), status: z.string().optional(), tag: z.string().optional() }).strict(),
    show: z.object({ id: z.string().trim().min(1), mode: z.enum(["content", "metadata", "raw"]).optional() }).strict(),
    lint: z.object({}).strict(), index: z.object({}).strict(),
    capture: z.object({ content: z.string().min(1) }).passthrough(),
    update: z.object({ id: z.string().min(1) }).passthrough(),
    append: z.object({ id: z.string().min(1), content: z.string().min(1) }).passthrough(),
    relate: z.object({ sourceId: z.string().min(1), targetId: z.string().min(1), relation: z.string().min(1) }).passthrough(),
    log: z.object({ content: z.string().min(1) }).passthrough(),
    source_add: z.object({ content: z.string().min(1), title: z.string().min(1) }).passthrough(),
    source_link: z.object({ sourceId: z.string().min(1), targetId: z.string().min(1) }).strict(),
  };
  const schema = schemas[action === "wiki.list" ? "list" : action === "wiki.show" ? "show" : action === "wiki.lint" ? "lint" : action === "wiki.index" ? "index" : intent] ?? z.record(z.string(), z.unknown());
  const parsed = schema.safeParse(value ?? {});
  return parsed.success ? { value: parsed.data } : { error: coreError("invalid_input", "Invalid intent input", parsed.error.issues) };
}
function coreError(code: CoreError["code"], message: string, details?: unknown): CoreError { return { code, message, ...(details === undefined ? {} : { details }) }; }
