import { executePlan, planIntent } from "./runtime.js";
import type { ResolvedThothConfig } from "./config.js";
import type { CoreErrorCode, CoreResult } from "./types.js";

export type QueryAdapterInput = {
  query: string;
  type?: string;
  status?: string;
  tag?: string;
  limit?: number;
};

export type QuerySummary = {
  id: string;
  title: string;
  type: string;
  status: string;
  tags: string[];
  path: string;
  snippet: string;
};

export class CoreQueryError extends Error {
  readonly code: CoreErrorCode;
  constructor(code: CoreErrorCode, message: string) {
    super(message);
    this.name = "CoreQueryError";
    this.code = code;
  }
}

/** Shared compatibility adapter for the legacy CLI/MCP search surfaces. */
export async function queryThroughCore(config: ResolvedThothConfig, input: QueryAdapterInput): Promise<QuerySummary[]> {
  const plan = planIntent(config, { intent: "query", input });
  if (plan.status === "error") throw fromCoreError(plan.error, input);
  const result = await executePlan(config, plan);
  if (!result.ok) throw fromCoreError(result.error, input);
  return extractQueryResults(result);
}

function extractQueryResults(result: CoreResult): QuerySummary[] {
  const payload = result.results?.[0];
  if (!payload || typeof payload !== "object") return [];
  const results = (payload as { results?: unknown }).results;
  return Array.isArray(results) ? results as QuerySummary[] : [];
}

function fromCoreError(error: CoreResult["error"] | undefined, input: QueryAdapterInput): CoreQueryError {
  if (error?.code === "invalid_input") {
    if (typeof input.query !== "string") return new CoreQueryError(error.code, "Search query must be a string");
    if (!input.query.trim()) return new CoreQueryError(error.code, "Search query must not be empty");
    if (input.query.trim().length > 500) return new CoreQueryError(error.code, "Search query must be at most 500 characters");
    if (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 20)) return new CoreQueryError(error.code, "Search limit must be a safe integer between 1 and 20");
  }
  return new CoreQueryError(error?.code ?? "execution_error", error?.message ?? "Core query failed");
}
