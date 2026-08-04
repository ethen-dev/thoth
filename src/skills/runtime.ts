import { lintWikiDocuments, searchWikiDocuments } from "../actions/wiki.js";
import { getSkill } from "./registry.js";
import type { SkillResult, SkillRuntimeConfig, SkillInvocation } from "./types.js";
import { z } from "zod/v4";

const querySchema = z.object({ query: z.string().trim().min(1).max(500), type: z.string().min(1).max(80).optional(), status: z.string().min(1).max(80).optional(), tag: z.string().min(1).max(120).optional() }).strict();
const lintSchema = z.object({}).strict();
const queryInput = (value: unknown) => querySchema.parse(value);

export async function runSkill(config: SkillRuntimeConfig, invocation: SkillInvocation): Promise<SkillResult> {
  if (!invocation || !["validate", "execute"].includes(invocation.mode)) return failure(String(invocation?.skillId ?? ""), "invalid_mode", "mode must be exactly validate or execute");
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
    else if (skill.id !== "wiki-lint" && invocation.mode === "execute") return failure(skill.id, "unsupported", "Skill has no allowlisted read-only handler");
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
  return { ok: false, skillId, mode, readOnly: true, status: code === "unsupported" ? "unsupported" : "error", error: { code, message } };
}

function normalizeSnippet(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
