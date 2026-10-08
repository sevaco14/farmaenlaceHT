// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import type { ActionCtx } from "./_generated/server";

const mocks = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn(), options: vi.fn(), permit: vi.fn() }));
vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: class {
    constructor(options: unknown) { mocks.options(options); }
    send = mocks.send;
    destroy = mocks.destroy;
  },
  ConverseCommand: class { constructor(public input: unknown) {} },
}));

import { AgentValidationError, bedrockConfigured, parseAgentJson, runAgentWithTools, safeBedrockError } from "./agents/bedrock";
import { analyzeCity } from "./agents/run";

// Convex attaches _handler at runtime; it is intentionally omitted from its
// published declarations. This isolated unit boundary avoids a real deployment.
const analyze = (analyzeCity as unknown as {
  _handler: (ctx: ActionCtx, args: { city: string; sku?: string }) => Promise<{
    ok: boolean; mode: "bedrock"; agents: Array<{ level: number }>;
  }>;
})._handler;

const valid = { summary: "Demanda observada en la zona.", level: 80, rationale: "Las herramientas muestran la evidencia sintética." };
const selection = { city: "guayaquil", sku: "FE-VC500" };
const answer = (text: string) => ({ output: { message: { role: "assistant", content: [{ text }] } }, stopReason: "end_turn" });
const tool = (name = "get_inventory_position", input: unknown = selection) => ({
  output: { message: { role: "assistant", content: [{ toolUse: { toolUseId: "call-1", name, input } }] } }, stopReason: "tool_use",
});

function agentArgs() {
  return {
    system: "Analiza datos sintéticos.", userTask: "Analiza Guayaquil.",
    tools: [{ name: "get_inventory_position", description: "Stock", inputSchema: { type: "object" } }],
    executeTool: vi.fn(async () => ({ stockPct: 20 })),
    withRequestPermit: async <T>(request: () => Promise<T>): Promise<T> => { mocks.permit(); return request(); },
  };
}

function fakeContext() {
  const name = (reference: unknown) => getFunctionName(reference as FunctionReference<"query">);
  const runQuery = vi.fn(async (reference: unknown) => {
    switch (name(reference)) {
      case "agentData:resolveSku": return { sku: selection.sku, product: "Vitamina C" };
      case "agentData:whatsappMetrics": return { ...selection, product: "Vitamina C", waRecent7: 100, waPrior21: 60, lift: 5, observedCount: 10, baselineCount: 2, metricWindow: "hour", sampleMessages: [], newsTitles: [] };
      case "agentData:inventoryMetrics": return { ...selection, product: "Vitamina C", onHand: 20, target: 100, stockPct: 20, liveStockId: "synthetic-live-id", decisionRevision: 0, criticalBranches: [] };
      case "agentData:promoMetrics": return { ...selection, product: "Vitamina C", activePromo: false, promos: [] };
      default: throw new Error(`Unexpected test query ${name(reference)}`);
    }
  });
  const runMutation = vi.fn(async (reference: unknown) => {
    switch (name(reference)) {
      case "agentRateLimit:acquire": return { granted: true, retryAfterMs: 0 };
      case "agentRateLimit:release": return null;
      case "agentApply:applyAgentRun": return { recommendationId: "synthetic-proposal", stale: false };
      default: throw new Error(`Unexpected test mutation ${name(reference)}`);
    }
  });
  return { ctx: { runQuery, runMutation } as unknown as ActionCtx, runQuery, runMutation, name };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockReset();
  vi.stubEnv("AWS_ACCESS_KEY_ID", "synthetic-test-key");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "synthetic-test-secret");
  vi.stubEnv("AWS_SESSION_TOKEN", "synthetic-test-token");
  vi.stubEnv("BEDROCK_USE_INSTANCE_ROLE", "false");
});

afterAll(() => vi.unstubAllEnvs());

describe("strict Bedrock JSON", () => {
  it("accepts only the validated schema", () => expect(parseAgentJson(JSON.stringify(valid))).toEqual(valid));
  it.each([
    "explanation only", "```json\n{}\n```", "{}", "null", "[]",
    JSON.stringify({ ...valid, level: "50" }), JSON.stringify({ ...valid, level: -1 }),
    JSON.stringify({ ...valid, level: 101 }), JSON.stringify({ ...valid, summary: " " }),
    JSON.stringify({ ...valid, summary: "x".repeat(301) }), JSON.stringify({ ...valid, rationale: "x".repeat(1001) }),
    JSON.stringify({ ...valid, approve: true }), '{"summary":"x","level":1e309,"rationale":"x"}',
  ])("rejects malformed/untrusted result %s", (text) => expect(() => parseAgentJson(text)).toThrow(AgentValidationError));
});

describe("Converse execution", () => {
  it("opts into the SDK default IAM provider without baking in temporary credentials", async () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "");
    vi.stubEnv("AWS_SESSION_TOKEN", "");
    vi.stubEnv("BEDROCK_USE_INSTANCE_ROLE", "true");
    expect(bedrockConfigured()).toBe(true);
    mocks.send.mockResolvedValueOnce(tool()).mockResolvedValueOnce(answer(JSON.stringify(valid)));
    await expect(runAgentWithTools(agentArgs())).resolves.toEqual(valid);
    expect(mocks.options.mock.calls[0][0]).not.toHaveProperty("credentials");
    expect(mocks.options.mock.calls[0][0]).toEqual(expect.objectContaining({ maxAttempts: 1, region: "us-east-1" }));
  });

  it("retries invalid final JSON exactly once and gates every Converse call", async () => {
    mocks.send.mockResolvedValueOnce(tool()).mockResolvedValueOnce(answer("invalid JSON")).mockResolvedValueOnce(answer(JSON.stringify(valid)));
    await expect(runAgentWithTools(agentArgs())).resolves.toEqual(valid);
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(mocks.permit).toHaveBeenCalledTimes(3);
    expect(mocks.options).toHaveBeenCalledWith(expect.objectContaining({ maxAttempts: 1 }));
    for (const [, options] of mocks.send.mock.calls) expect(options.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("two invalid final replies stop with no fallback", async () => {
    mocks.send.mockResolvedValueOnce(tool()).mockResolvedValueOnce(answer("invalid")).mockResolvedValueOnce(answer("still invalid"));
    await expect(runAgentWithTools(agentArgs())).rejects.toBeInstanceOf(AgentValidationError);
    expect(mocks.send).toHaveBeenCalledTimes(3);
  });

  it.each(["ExpiredTokenException", "AbortError"])("does not retry an AWS %s", async (name) => {
    const error = Object.assign(new Error("sensitive provider detail"), { name });
    mocks.send.mockRejectedValueOnce(error);
    await expect(runAgentWithTools(agentArgs())).rejects.toBe(error);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(safeBedrockError(error)).not.toContain("sensitive provider detail");
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
  });

  it("rejects a tool outside this agent's allowlist", async () => {
    const args = agentArgs();
    mocks.send.mockResolvedValueOnce(tool("approve_purchase"));
    await expect(runAgentWithTools(args)).rejects.toBeInstanceOf(AgentValidationError);
    expect(args.executeTool).not.toHaveBeenCalled();
  });
});

describe("analysis persistence boundary", () => {
  it("missing AWS configuration never changes database state", async () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "");
    const { ctx, runMutation } = fakeContext();
    await expect(analyze(ctx, selection)).rejects.toThrow(/credenciales AWS/);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("expired AWS session does not apply any new signals or recommendation", async () => {
    mocks.send.mockRejectedValueOnce(Object.assign(new Error("sensitive"), { name: "ExpiredTokenException" }));
    const { ctx, runMutation, name } = fakeContext();
    await expect(analyze(ctx, selection)).rejects.toThrow(/sesión temporal/);
    expect(runMutation.mock.calls.map(([ref]) => name(ref))).toEqual(["agentRateLimit:acquire", "agentRateLimit:release"]);
  });

  it("invalid replies never apply new recommendations", async () => {
    mocks.send.mockResolvedValueOnce(tool("get_whatsapp_metrics")).mockResolvedValueOnce(answer("bad")).mockResolvedValueOnce(answer("bad again"));
    const { ctx, runMutation, name } = fakeContext();
    await expect(analyze(ctx, selection)).rejects.toThrow(/JSON válido/);
    expect(runMutation.mock.calls.some(([ref]) => name(ref) === "agentApply:applyAgentRun")).toBe(false);
  });

  it("refuses model tool arguments outside the selected city/SKU", async () => {
    mocks.send.mockResolvedValueOnce(tool("get_whatsapp_metrics", { ...selection, city: "quito" }));
    const { ctx, runMutation, name } = fakeContext();
    await expect(analyze(ctx, selection)).rejects.toThrow(/JSON válido/);
    expect(runMutation.mock.calls.some(([ref]) => name(ref) === "agentApply:applyAgentRun")).toBe(false);
  });

  it("persists once only after all agents succeed, with factual inventory and promo levels", async () => {
    for (const name of ["get_whatsapp_metrics", "get_inventory_position", "get_promo_calendar"]) {
      mocks.send.mockResolvedValueOnce(tool(name)).mockResolvedValueOnce(answer(JSON.stringify(valid)));
    }
    const { ctx, runMutation, name } = fakeContext();
    const result = await analyze(ctx, selection);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("bedrock");
    expect(result.agents.map((agent) => agent.level)).toEqual([80, 20, 0]);
    expect(runMutation.mock.calls.filter(([ref]) => name(ref) === "agentApply:applyAgentRun")).toHaveLength(1);
    expect(mocks.send).toHaveBeenCalledTimes(6);
  });
});
