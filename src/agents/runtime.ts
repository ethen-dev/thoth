import type { ResolvedThothConfig } from "../core/index.js";
import { getAgent } from "./registry.js";
import type { AgentRegistryEntry } from "./registry.js";
import { recordAudit } from "../audit/index.js";

export const maxAgentInputLength = 8_000;
export const maxAgentOutputLength = 16_000;
export const maxAgentTimeoutMs = 30_000;

/** Explicitly executable internal agents. The registry remains metadata-only for now. */
export const agentExecutionAllowlist = [
  "thoth-memory",
  "thoth-archivist",
  "thoth-indexer",
  "thoth-scribe",
  "thoth-critic",
  "thoth-dev-router",
  "thoth-dev-explorer",
  "thoth-dev-implementer",
  "thoth-dev-reviewer",
  "thoth-dev-verifier",
  "thoth-dev-receipt",
] as const;

export type AgentExecutionMode = "validate" | "plan" | "execute";

export type AgentExecutionRequest = {
  agentId: string;
  input: string;
  mode: AgentExecutionMode;
  /** Required only for execute; injected adapters are trusted and not sandboxed. */
  timeoutMs?: number;
};

export type AgentAdapterRequest = Omit<AgentExecutionRequest, "timeoutMs"> & {
  agent: AgentRegistryEntry;
};

export type AgentAdapter = {
  execute(request: AgentAdapterRequest): Promise<unknown>;
};

export type AgentExecutionErrorCode =
  | "invalid_input"
  | "not_found"
  | "not_allowlisted"
  | "unsupported_source"
  | "unsupported_runtime"
  | "adapter_required"
  | "timeout"
  | "input_too_large"
  | "output_too_large"
  | "invalid_output"
  | "execution_error";

export type AgentExecutionError = {
  code: AgentExecutionErrorCode;
  message: string;
};

export type AgentExecutionResult = {
  ok: boolean;
  agentId: string;
  mode: AgentExecutionMode;
  readOnly: boolean;
  status: "validated" | "planned" | "executed" | "error";
  output?: Record<string, unknown>;
  error?: AgentExecutionError;
};

export async function executeAgent(
  config: ResolvedThothConfig,
  request: AgentExecutionRequest,
  adapter?: AgentAdapter,
): Promise<AgentExecutionResult> {
  const started = Date.now();
  const result = await executeAgentInternal(config, request, adapter);
  await recordAudit(config, { operation: `agent.${request?.agentId ?? "unknown"}.${request?.mode ?? "error"}`, surface: "agent", actor: config.audit?.actor ?? "system", result: result.ok ? (result.status === "planned" ? "planned" : result.status === "executed" ? "executed" : "proposed") : "error", affectedIds: request?.agentId ? [request.agentId] : [], durationMs: Date.now() - started, error: result.error ? { code: result.error.code, message: result.error.message } : undefined });
  return result;
}

async function executeAgentInternal(
  config: ResolvedThothConfig,
  request: AgentExecutionRequest,
  adapter?: AgentAdapter,
): Promise<AgentExecutionResult> {
  const basicError = validateRequest(request);
  if (basicError) return failure(request?.agentId ?? "", request?.mode, basicError);

  if (request.input.length > maxAgentInputLength) {
    return failure(request.agentId, request.mode, {
      code: "input_too_large",
      message: `Agent input must be at most ${maxAgentInputLength} characters`,
    });
  }

  let agent: AgentRegistryEntry | undefined;
  try {
    agent = await getAgent(config, request.agentId);
  } catch (error) {
    return failure(request.agentId, request.mode, { code: "execution_error", message: errorMessage(error) });
  }
  if (!agent) return failure(request.agentId, request.mode, { code: "not_found", message: `Agent not found: ${request.agentId}` });
  if (agent.source !== "internal") {
    return failure(request.agentId, request.mode, { code: "unsupported_source", message: "Only internal agents can execute" });
  }
  if (agent.runtime !== "prompt") {
    return failure(request.agentId, request.mode, { code: "unsupported_runtime", message: "Only the prompt runtime is supported" });
  }
  if (!agentExecutionAllowlist.includes(agent.id as (typeof agentExecutionAllowlist)[number])) {
    return failure(request.agentId, request.mode, { code: "not_allowlisted", message: `Agent is not allowlisted: ${request.agentId}` });
  }

  if (request.mode === "validate") return success(request, "validated");
  if (request.mode === "plan") return success(request, "planned");
  if (!adapter) return failure(request.agentId, request.mode, { code: "adapter_required", message: "An injected AgentAdapter is required for execute" });

  try {
    const { timeoutMs, ...adapterRequest } = request;
    const output = await withTimeout(adapter.execute({ ...adapterRequest, agent }), timeoutMs!);
    if (!isStructuredOutput(output)) {
      return failure(request.agentId, request.mode, { code: "invalid_output", message: "Agent output must be a structured JSON object" });
    }
    const serialized = JSON.stringify(output);
    if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > maxAgentOutputLength) {
      return failure(request.agentId, request.mode, { code: "output_too_large", message: `Agent output must be at most ${maxAgentOutputLength} bytes` });
    }
    return { ...success(request, "executed"), output };
  } catch (error) {
    return failure(request.agentId, request.mode, error instanceof TimeoutError
      ? { code: "timeout", message: `Agent execution exceeded ${request.timeoutMs}ms` }
      : { code: "execution_error", message: errorMessage(error) });
  }
}

export const runAgent = executeAgent;

function validateRequest(request: AgentExecutionRequest): AgentExecutionError | undefined {
  if (!request || typeof request.agentId !== "string" || !request.agentId.trim() || typeof request.input !== "string") {
    return { code: "invalid_input", message: "agentId and textual input are required" };
  }
  if (!["validate", "plan", "execute"].includes(request.mode)) {
    return { code: "invalid_input", message: "mode must be validate, plan or execute" };
  }
  if (request.mode === "execute" && (!Number.isInteger(request.timeoutMs) || request.timeoutMs! <= 0 || request.timeoutMs! > maxAgentTimeoutMs)) {
    return { code: "invalid_input", message: `execute requires timeoutMs between 1 and ${maxAgentTimeoutMs}` };
  }
  return undefined;
}

function isStructuredOutput(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function success(request: AgentExecutionRequest, status: "validated" | "planned" | "executed"): AgentExecutionResult {
  return { ok: true, agentId: request.agentId, mode: request.mode, readOnly: true, status };
}

function failure(agentId: string, mode: AgentExecutionMode | undefined, error: AgentExecutionError): AgentExecutionResult {
  return { ok: false, agentId, mode: mode ?? "execute", readOnly: true, status: "error", error };
}

class TimeoutError extends Error {}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
