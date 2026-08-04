import { describe, expect, it, vi } from "vitest";
import { executeAgent, maxAgentInputLength, maxAgentOutputLength } from "../src/agents/runtime.js";

vi.mock("../src/agents/registry.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/agents/registry.js")>();
  return {
    ...original,
    getAgent: vi.fn(async (_config: unknown, id: string) => id === "thoth-memory"
      ? { id, path: "agent.md", runtime: "prompt", category: "test", status: "active", source: "internal" }
      : id === "external-agent"
        ? { id, path: "agent.md", runtime: "prompt", category: "test", status: "active", source: "external" }
        : id === "opencode-agent"
          ? { id, path: "agent.md", runtime: "opencode", category: "test", status: "active", source: "internal" }
          : id === "not-allowlisted"
            ? { id, path: "agent.md", runtime: "prompt", category: "test", status: "active", source: "internal" }
            : undefined),
  };
});

const config = {} as never;
const request = (mode: "validate" | "plan" | "execute" = "execute", input = "hello") => ({
  agentId: "thoth-memory", input, mode, ...(mode === "execute" ? { timeoutMs: 50 } : {}),
});

describe("agent runtime", () => {
  it("rejects unknown, external, unsupported and non-allowlisted IDs", async () => {
    expect((await executeAgent(config, { ...request(), agentId: "missing" })).error?.code).toBe("not_found");
    expect((await executeAgent(config, { ...request(), agentId: "external-agent" })).error?.code).toBe("unsupported_source");
    expect((await executeAgent(config, { ...request(), agentId: "opencode-agent" })).error?.code).toBe("unsupported_runtime");
    expect((await executeAgent(config, { ...request(), agentId: "not-allowlisted" })).error?.code).toBe("not_allowlisted");
  });

  it("validates and plans without an adapter", async () => {
    const adapter = { execute: vi.fn() };
    expect((await executeAgent(config, request("validate"), adapter)).status).toBe("validated");
    expect((await executeAgent(config, request("plan"), adapter)).status).toBe("planned");
    expect(adapter.execute).not.toHaveBeenCalled();
  });

  it("requires an adapter and executes structured output", async () => {
    expect((await executeAgent(config, request())).error?.code).toBe("adapter_required");
    const adapter = { execute: vi.fn(async () => ({ answer: "ok" })) };
    const result = await executeAgent(config, request(), adapter);
    expect(result).toMatchObject({ ok: true, status: "executed", output: { answer: "ok" } });
    expect(adapter.execute).toHaveBeenCalledWith({
      agentId: "thoth-memory",
      input: "hello",
      mode: "execute",
      agent: {
        id: "thoth-memory",
        path: "agent.md",
        runtime: "prompt",
        category: "test",
        status: "active",
        source: "internal",
      },
    });
  });

  it("enforces timeout and input/output limits", async () => {
    const slow = { execute: vi.fn(() => new Promise(() => undefined)) };
    expect((await executeAgent(config, request(), slow)).error?.code).toBe("timeout");
    expect((await executeAgent(config, request("execute", "x".repeat(maxAgentInputLength + 1)), slow)).error?.code).toBe("input_too_large");
    const large = { execute: vi.fn(async () => ({ value: "x".repeat(maxAgentOutputLength) })) };
    expect((await executeAgent(config, request(), large)).error?.code).toBe("output_too_large");
  });

  it("rejects unstructured output and invalid execute timeout", async () => {
    const adapter = { execute: vi.fn(async () => "markdown") };
    expect((await executeAgent(config, request(), adapter)).error?.code).toBe("invalid_output");
    expect((await executeAgent(config, { ...request(), timeoutMs: undefined }, adapter)).error?.code).toBe("invalid_input");
  });

  it("has no subprocess or write integration", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../src/agents/runtime.ts", import.meta.url), "utf8"));
    expect(source).not.toMatch(/child_process|spawn\(|exec\(|writeFile|fetch\(/);
  });
});
